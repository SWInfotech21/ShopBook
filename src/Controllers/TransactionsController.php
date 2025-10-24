<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Security;
use App\Models\Transaction;
use App\Models\TransactionLine;
use App\Models\AuditLog;
use App\Models\Loan;
use PDO;

class TransactionsController
{
    public function create(): void
    {
        $auth = Security::requireAuth(['admin','user']);
        $input = json_decode(file_get_contents('php://input'), true) ?? [];

        $required = ['type','amount','received_in_account_id','debit_from_account_id','created_by'];
        foreach ($required as $r) {
            if (!isset($input[$r])) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing field: ' . $r]);
                return;
            }
        }

        $type = $input['type'];
        if (!in_array($type, ['MT','R','T','PS','PP','L','B'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid type']);
            return;
        }

        $amount = (float)$input['amount'];
        $commission = (float)($input['commission_amount'] ?? 0);
        $commissionAccount = $input['commission_account_id'] ?? null;
        $recvId = (int)$input['received_in_account_id'];
        $debitId = (int)$input['debit_from_account_id'];
        if ($amount <= 0 || $commission < 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid amounts']);
            return;
        }

        $pdo = Database::pdo();
        // Guard: ensure sufficient balance on the debit side before proceeding
        try {
            $stmt = $pdo->prepare('SELECT current_balance FROM accounts WHERE id = ?');
            $stmt->execute([$debitId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid debit account']);
                return;
            }
            $currBal = (float)$row['current_balance'];
            if ($amount > $currBal) {
                http_response_code(400);
                echo json_encode(['error' => 'Insufficient balance in the debit account']);
                return;
            }
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Balance check failed', 'details' => $e->getMessage()]);
            return;
        }
        try {
            $pdo->beginTransaction();
            // Ensure unique transaction reference
            $providedRef = trim($input['transaction_ref'] ?? '');
            $txRef = $providedRef !== '' ? $providedRef : null;
            if ($txRef === null) {
                // generate and ensure uniqueness with a few attempts
                $attempts = 0;
                do {
                    $attempts++;
                    $txRef = 'TX' . date('YmdHis') . random_int(100, 999);
                    $check = $pdo->prepare('SELECT 1 FROM transactions WHERE transaction_ref = ? LIMIT 1');
                    $check->execute([$txRef]);
                    $exists = (bool)$check->fetchColumn();
                } while ($exists && $attempts < 5);
                if ($exists) {
                    throw new \RuntimeException('Could not generate unique transaction reference');
                }
            } else {
                $check = $pdo->prepare('SELECT 1 FROM transactions WHERE transaction_ref = ? LIMIT 1');
                $check->execute([$txRef]);
                if ($check->fetchColumn()) {
                    http_response_code(409);
                    echo json_encode(['error' => 'Duplicate transaction_ref']);
                    $pdo->rollBack();
                    return;
                }
            }

            $txId = Transaction::create([
                'transaction_ref' => $txRef,
                'type' => $type,
                'amount' => $amount,
                'commission_amount' => $commission,
                'commission_account_id' => $commissionAccount,
                'received_in_account_id' => $recvId,
                'debit_from_account_id' => $debitId,
                'option_pay_later' => (int)($input['option_pay_later'] ?? 0),
                'remarks' => $input['remarks'] ?? null,
                'created_by' => (int)$input['created_by'],
            ]);

            // Double-entry lines
            // Debit from debitId
            $stmt = $pdo->prepare('UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?');
            $stmt->execute([$amount, $debitId]);
            TransactionLine::add($txId, $debitId, 'debit', $amount, 'Main debit');

            // Credit to receivedIn
            $stmt = $pdo->prepare('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?');
            $stmt->execute([$amount, $recvId]);
            TransactionLine::add($txId, $recvId, 'credit', $amount, 'Main credit');

            // Commission line (credit to commission account)
            if ($commission > 0 && $commissionAccount !== null) {
                $stmt = $pdo->prepare('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?');
                $stmt->execute([$commission, $commissionAccount]);
                TransactionLine::add($txId, (int)$commissionAccount, 'credit', $commission, 'Commission');
            }

            AuditLog::add('transactions', $txId, 'create', null, $input, $auth['id']);

            $pdo->commit();
            echo json_encode(['transaction_id' => $txId, 'transaction_ref' => $txRef]);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            http_response_code(500);
            echo json_encode(['error' => 'Transaction failed', 'details' => $e->getMessage()]);
        }
    }

    public function recent(): void
    {
        Security::requireAuth(['admin','readonly_admin','user']);
        $pdo = Database::pdo();
        $limit = isset($_GET['limit']) ? max(1, min(1000, (int)$_GET['limit'])) : 10;
        $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
        $from = $_GET['from'] ?? null;
        $to = $_GET['to'] ?? null;
        $q = trim($_GET['q'] ?? '');
        $qField = $_GET['q_field'] ?? 'all';
        $params = [];
        $wheres = [];
        if ($from && $to) {
            $start = $from . ' 00:00:00';
            $end = $to . ' 23:59:59';
            $wheres[] = 't.created_at BETWEEN ? AND ?';
            $params[] = $start;
            $params[] = $end;
        }
        if ($q !== '') {
            $like = '%' . $q . '%';
            switch ($qField) {
                case 'type':
                    $wheres[] = 't.type LIKE ?';
                    $params[] = $like;
                    break;
                case 'amount':
                    if (is_numeric($q)) {
                        $wheres[] = 't.amount = ?';
                        $params[] = (float)$q;
                    } else {
                        $wheres[] = 'CAST(t.amount AS CHAR) LIKE ?';
                        $params[] = $like;
                    }
                    break;
                case 'received':
                    $wheres[] = 'a_recv.name LIKE ?';
                    $params[] = $like;
                    break;
                case 'debit':
                    $wheres[] = 'a_debit.name LIKE ?';
                    $params[] = $like;
                    break;
                case 'ref':
                    $wheres[] = 't.transaction_ref LIKE ?';
                    $params[] = $like;
                    break;
                case 'user':
                    $wheres[] = 'u.username LIKE ?';
                    $params[] = $like;
                    break;
                case 'remarks':
                    $wheres[] = 't.remarks LIKE ?';
                    $params[] = $like;
                    break;
                case 'all':
                default:
                    $wheres[] = '(t.transaction_ref LIKE ? OR t.remarks LIKE ? OR a_recv.name LIKE ? OR a_debit.name LIKE ? OR a_comm.name LIKE ? OR t.type LIKE ? OR u.username LIKE ? OR CAST(t.amount AS CHAR) LIKE ?)';
                    array_push($params, $like, $like, $like, $like, $like, $like, $like, $like);
                    break;
            }
        }
        $where = $wheres ? ('WHERE ' . implode(' AND ', $wheres)) : '';
        $sql = "SELECT 
                    t.id,
                    t.transaction_ref,
                    t.type,
                    t.amount,
                    t.commission_amount,
                    t.created_at,
                    a_recv.name AS received_in_account,
                    a_debit.name AS debit_from_account,
                    a_comm.name AS commission_account,
                    u.username AS created_by_username,
                    t.remarks
                FROM transactions t
                LEFT JOIN accounts a_recv ON a_recv.id = t.received_in_account_id
                LEFT JOIN accounts a_debit ON a_debit.id = t.debit_from_account_id
                LEFT JOIN accounts a_comm ON a_comm.id = t.commission_account_id
                LEFT JOIN users u ON u.id = t.created_by
                $where
                ORDER BY t.created_at DESC, t.id DESC
                LIMIT ? OFFSET ?";
        $bindParams = $params; // where params only
        $execParams = $params; // where + limit/offset
        $execParams[] = $limit;
        $execParams[] = $offset;
        $stmt = $pdo->prepare($sql);
        foreach ($execParams as $i => $val) {
            $type = is_int($val) ? \PDO::PARAM_INT : \PDO::PARAM_STR;
            $stmt->bindValue($i + 1, $val, $type);
        }
        $stmt->execute();
        $rows = $stmt->fetchAll();

        // total count for pagination
        $countSql = "SELECT COUNT(*) FROM transactions t
            LEFT JOIN accounts a_recv ON a_recv.id = t.received_in_account_id
            LEFT JOIN accounts a_debit ON a_debit.id = t.debit_from_account_id
            LEFT JOIN accounts a_comm ON a_comm.id = t.commission_account_id
            LEFT JOIN users u ON u.id = t.created_by
            $where";
        $countStmt = $pdo->prepare($countSql);
        foreach ($bindParams as $i => $val) {
            $type = is_int($val) ? \PDO::PARAM_INT : \PDO::PARAM_STR;
            $countStmt->bindValue($i + 1, $val, $type);
        }
        $countStmt->execute();
        $total = (int)$countStmt->fetchColumn();
        echo json_encode(['data' => $rows, 'total' => $total, 'limit' => $limit, 'offset' => $offset]);
    }

    public function oneway(): void
    {
        $auth = Security::requireAuth(['admin','user']);
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $type = $input['type'] ?? '';
        $txMode = $input['tx_mode'] ?? 'MT';
        $amount = isset($input['amount']) ? (float)$input['amount'] : 0.0;
        $accountId = isset($input['account_id']) ? (int)$input['account_id'] : 0;
        $commission = (float)($input['commission_amount'] ?? 0);
        $commissionAccountId = isset($input['commission_account_id']) ? (int)$input['commission_account_id'] : null;
        $remarks = $input['remarks'] ?? null;
        $optionPayLater = isset($input['option_pay_later']) ? (int)$input['option_pay_later'] : 0;
        if (!in_array($type, ['Credit','Debit'], true) || $amount <= 0 || $accountId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid input']);
            return;
        }
        // validate tx mode same as create() handler
        if (!in_array($txMode, ['MT','R','T','PS','PP','L','B'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid tx_mode']);
            return;
        }
        $pdo = Database::pdo();
        // Guard: for One Way Debit, ensure sufficient balance
        if ($type === 'Debit') {
            try {
                $stmt = $pdo->prepare('SELECT current_balance FROM accounts WHERE id = ?');
                $stmt->execute([$accountId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid account']);
                    return;
                }
                $currBal = (float)$row['current_balance'];
                if ($amount > $currBal) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Insufficient balance in the account']);
                    return;
                }
            } catch (\Throwable $e) {
                http_response_code(500);
                echo json_encode(['error' => 'Balance check failed', 'details' => $e->getMessage()]);
                return;
            }
        }
        try {
            $pdo->beginTransaction();
            // Generate a simple reference for one way tx
            $txRef = 'OW' . date('YmdHis') . random_int(100, 999);
            // Map one-way to transaction row: set provided tx_mode as transaction type and set the appropriate side
            $txData = [
                'transaction_ref' => $txRef,
                'type' => $txMode,
                'amount' => $amount,
                'commission_amount' => $commission,
                'commission_account_id' => $commissionAccountId,
                'received_in_account_id' => null,
                'debit_from_account_id' => null,
                'option_pay_later' => $optionPayLater,
                'remarks' => $remarks,
                'created_by' => (int)$auth['id'],
            ];
            if ($type === 'Credit') {
                $txData['received_in_account_id'] = $accountId;
            } else { // Debit
                $txData['debit_from_account_id'] = $accountId;
            }
            $txId = Transaction::create($txData);
            if ($type === 'Credit') {
                $stmt = $pdo->prepare('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?');
                $stmt->execute([$amount, $accountId]);
                TransactionLine::add($txId, $accountId, 'credit', $amount, $remarks ?: 'One Way Credit');
            } else {
                $stmt = $pdo->prepare('UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?');
                $stmt->execute([$amount, $accountId]);
                TransactionLine::add($txId, $accountId, 'debit', $amount, $remarks ?: 'One Way Debit');
            }
            // If marked for future use, create a loan entry with party_name = remarks, status = open, due_date = +15 days
            if ($optionPayLater === 1) {
                $dueDate = date('Y-m-d', strtotime('+15 days'));
                Loan::create($txId, $remarks ?? null, $amount, $dueDate);
            }
            AuditLog::add('transactions', $txId, 'oneway', null, $input, $auth['id']);
            $pdo->commit();
            echo json_encode(['transaction_id' => $txId, 'transaction_ref' => $txRef]);
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) { $pdo->rollBack(); }
            http_response_code(500);
            echo json_encode(['error' => 'One Way transaction failed', 'details' => $e->getMessage()]);
        }
    }
}
