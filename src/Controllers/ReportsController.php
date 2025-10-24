<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Security;

class ReportsController
{
    public function daySummary(): void
    {
        Security::requireAuth(['admin','readonly_admin','user']);
        $date = $_GET['date'] ?? date('Y-m-d');
        $start = $date . ' 00:00:00';
        $end = $date . ' 23:59:59';
        $pdo = Database::pdo();
        // True opening = base opening + net of all transactions before start of day
        // True closing = opening + net of all transactions within the selected day
        $sql = "SELECT a.id, a.name,
                (
                  a.opening_balance
                  + COALESCE(SUM(CASE WHEN t.created_at < ? AND tl.direction='credit' THEN tl.amount END),0)
                  - COALESCE(SUM(CASE WHEN t.created_at < ? AND tl.direction='debit' THEN tl.amount END),0)
                ) AS opening_balance,
                COALESCE(SUM(CASE WHEN t.created_at BETWEEN ? AND ? AND tl.direction='credit' THEN tl.amount END),0) AS total_credits,
                COALESCE(SUM(CASE WHEN t.created_at BETWEEN ? AND ? AND tl.direction='debit' THEN tl.amount END),0) AS total_debits,
                (
                  a.opening_balance
                  + COALESCE(SUM(CASE WHEN t.created_at < ? AND tl.direction='credit' THEN tl.amount END),0)
                  - COALESCE(SUM(CASE WHEN t.created_at < ? AND tl.direction='debit' THEN tl.amount END),0)
                  + COALESCE(SUM(CASE WHEN t.created_at BETWEEN ? AND ? AND tl.direction='credit' THEN tl.amount END),0)
                  - COALESCE(SUM(CASE WHEN t.created_at BETWEEN ? AND ? AND tl.direction='debit' THEN tl.amount END),0)
                ) AS closing_balance
            FROM accounts a
            LEFT JOIN transaction_lines tl ON tl.account_id = a.id
            LEFT JOIN transactions t ON t.id = tl.transaction_id
            WHERE (
              (a.created_at IS NOT NULL AND a.created_at <= ?)
              OR EXISTS (
                SELECT 1 FROM transaction_lines tl2
                JOIN transactions t2 ON t2.id = tl2.transaction_id
                WHERE tl2.account_id = a.id AND t2.created_at <= ?
              )
            )
            GROUP BY a.id, a.name, a.opening_balance
            ORDER BY a.id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $start, $start,                       // opening (credits, debits before start)
            $start, $end,                         // total_credits (within day)
            $start, $end,                         // total_debits (within day)
            $start, $start,                       // closing includes opening components again
            $start, $end,                         // plus day credits
            $start, $end,                         // minus day debits
            $end,                                  // account existed by end of day (created_at)
            $end,                                  // or has any transaction on/before end
        ]);
        echo json_encode($stmt->fetchAll());
    }

    public function ledger(): void
    {
        Security::requireAuth(['admin','readonly_admin','user']);
        $accountId = isset($_GET['account_id']) ? (int)$_GET['account_id'] : 0;
        $from = $_GET['from'] ?? '1970-01-01';
        $to = $_GET['to'] ?? date('Y-m-d');
        $start = $from . ' 00:00:00';
        $end = $to . ' 23:59:59';
        $limit = isset($_GET['limit']) ? max(1, (int)$_GET['limit']) : 25;
        $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
        $pdo = Database::pdo();
        if ($accountId > 0) {
            // counts: transaction lines + opening rows
            $sqlCount1 = "SELECT COUNT(*)
                          FROM transaction_lines tl
                          JOIN transactions t ON t.id = tl.transaction_id
                          WHERE tl.account_id = ? AND t.created_at BETWEEN ? AND ?";
            $stmtC1 = $pdo->prepare($sqlCount1);
            $stmtC1->execute([$accountId, $start, $end]);
            $c1 = (int)($stmtC1->fetchColumn() ?: 0);
            $sqlCount2 = "SELECT COUNT(*)
                          FROM accounts a
                          WHERE a.id = ? AND a.opening_balance > 0 AND a.created_at BETWEEN ? AND ?";
            $stmtC2 = $pdo->prepare($sqlCount2);
            $stmtC2->execute([$accountId, $start, $end]);
            $c2 = (int)($stmtC2->fetchColumn() ?: 0);
            $total = $c1 + $c2;

            // page data with UNION (transaction lines + synthetic opening)
            $sql = "(
                        SELECT t.id as transaction_id, t.transaction_ref, t.type, t.created_at, tl.direction, tl.amount, tl.notes, tl.account_id, u.username as tr_by
                        FROM transaction_lines tl
                        JOIN transactions t ON t.id = tl.transaction_id
                        LEFT JOIN users u ON u.id = t.created_by
                        WHERE tl.account_id = :acc AND t.created_at BETWEEN :s AND :e
                    )
                    UNION ALL
                    (
                        SELECT NULL as transaction_id, NULL as transaction_ref, 'OPEN' as type, a.created_at as created_at,
                               'credit' as direction, a.opening_balance as amount, 'Account Opening' as notes, a.id as account_id, NULL as tr_by
                        FROM accounts a
                        WHERE a.id = :acc2 AND a.opening_balance > 0 AND a.created_at BETWEEN :s2 AND :e2
                    )
                    ORDER BY created_at DESC, COALESCE(transaction_id, 0) DESC
                    LIMIT :lim OFFSET :off";
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':acc', $accountId, \PDO::PARAM_INT);
            $stmt->bindValue(':s', $start);
            $stmt->bindValue(':e', $end);
            $stmt->bindValue(':acc2', $accountId, \PDO::PARAM_INT);
            $stmt->bindValue(':s2', $start);
            $stmt->bindValue(':e2', $end);
            $stmt->bindValue(':lim', $limit, \PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset, \PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll();
        } else {
            // all accounts
            $sqlCount1 = "SELECT COUNT(*)
                          FROM transaction_lines tl
                          JOIN transactions t ON t.id = tl.transaction_id
                          WHERE t.created_at BETWEEN ? AND ?";
            $stmtC1 = $pdo->prepare($sqlCount1);
            $stmtC1->execute([$start, $end]);
            $c1 = (int)($stmtC1->fetchColumn() ?: 0);
            $sqlCount2 = "SELECT COUNT(*) FROM accounts a WHERE a.opening_balance > 0 AND a.created_at BETWEEN ? AND ?";
            $stmtC2 = $pdo->prepare($sqlCount2);
            $stmtC2->execute([$start, $end]);
            $c2 = (int)($stmtC2->fetchColumn() ?: 0);
            $total = $c1 + $c2;

            $sql = "(
                        SELECT t.id as transaction_id, t.transaction_ref, t.type, t.created_at, tl.direction, tl.amount, tl.notes, tl.account_id, u.username as tr_by
                        FROM transaction_lines tl
                        JOIN transactions t ON t.id = tl.transaction_id
                        LEFT JOIN users u ON u.id = t.created_by
                        WHERE t.created_at BETWEEN :s AND :e
                    )
                    UNION ALL
                    (
                        SELECT NULL as transaction_id, NULL as transaction_ref, 'OPEN' as type, a.created_at as created_at,
                               'credit' as direction, a.opening_balance as amount, 'Account Opening' as notes, a.id as account_id, NULL as tr_by
                        FROM accounts a
                        WHERE a.opening_balance > 0 AND a.created_at BETWEEN :s2 AND :e2
                    )
                    ORDER BY created_at DESC, COALESCE(transaction_id, 0) DESC
                    LIMIT :lim OFFSET :off";
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(':s', $start);
            $stmt->bindValue(':e', $end);
            $stmt->bindValue(':s2', $start);
            $stmt->bindValue(':e2', $end);
            $stmt->bindValue(':lim', $limit, \PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset, \PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll();
        }
        echo json_encode(['data' => $rows, 'total' => $total]);
    }

    public function commissions(): void
    {
        Security::requireAuth(['admin','readonly_admin','user']);
        $from = $_GET['from'] ?? '1970-01-01';
        $to = $_GET['to'] ?? date('Y-m-d');
        $start = $from . ' 00:00:00';
        $end = $to . ' 23:59:59';
        $pdo = Database::pdo();
        $sql = "SELECT a.name as commission_account, DATE(t.created_at) as date,
                       SUM(t.commission_amount) as total_commission
                FROM transactions t
                LEFT JOIN accounts a ON a.id = t.commission_account_id
                WHERE t.created_at BETWEEN ? AND ? AND t.commission_amount > 0
                GROUP BY a.name, DATE(t.created_at)
                ORDER BY date";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$start, $end]);
        echo json_encode($stmt->fetchAll());
    }
}
