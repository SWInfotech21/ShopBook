<?php
namespace App\Controllers;

use App\Core\Database;
use App\Core\Security;
use PDO;

class LoansController
{
    public function recent(): void
    {
        Security::requireAuth(['admin','readonly_admin','user']);
        $pdo = Database::pdo();
        $limit = isset($_GET['limit']) ? max(1, min(1000, (int)$_GET['limit'])) : 10;
        $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;
        $from = $_GET['from'] ?? null;
        $to = $_GET['to'] ?? null;
        $status = $_GET['status'] ?? 'all';
        $q = trim($_GET['q'] ?? '');

        $wheres = [];
        $params = [];
        if ($from && $to) {
            $wheres[] = 'l.created_at BETWEEN ? AND ?';
            $params[] = $from . ' 00:00:00';
            $params[] = $to . ' 23:59:59';
        }
        if ($status && $status !== 'all') {
            $wheres[] = 'l.status = ?';
            $params[] = $status;
        }
        if ($q !== '') {
            $wheres[] = '(l.party_name LIKE ? OR l.amount = ? OR CAST(l.amount AS CHAR) LIKE ?)';
            $like = '%' . $q . '%';
            $params[] = $like;
            if (is_numeric($q)) {
                $params[] = (float)$q;
            } else {
                $params[] = -99999999; // will not match exact amount
            }
            $params[] = $like;
        }
        $where = $wheres ? ('WHERE ' . implode(' AND ', $wheres)) : '';

        $sql = "SELECT l.id, l.transaction_id, l.party_name, l.amount, l.due_date, l.status, l.created_at,
                       t.transaction_ref, t.type,
                       CASE WHEN t.debit_from_account_id IS NOT NULL THEN 'Debit' ELSE 'Credit' END AS tr_type,
                       COALESCE(a_recv.name, a_debit.name) AS account_name
                FROM loans l
                LEFT JOIN transactions t ON t.id = l.transaction_id
                LEFT JOIN accounts a_recv ON a_recv.id = t.received_in_account_id
                LEFT JOIN accounts a_debit ON a_debit.id = t.debit_from_account_id
                $where
                ORDER BY l.created_at DESC, l.id DESC
                LIMIT ? OFFSET ?";
        $exec = $params;
        $exec[] = $limit;
        $exec[] = $offset;
        $stmt = $pdo->prepare($sql);
        foreach ($exec as $i => $val) {
            $type = is_int($val) ? PDO::PARAM_INT : PDO::PARAM_STR;
            $stmt->bindValue($i + 1, $val, $type);
        }
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // totals and count
        $countSql = "SELECT COUNT(*), COALESCE(SUM(amount),0) FROM loans l $where";
        $cStmt = $pdo->prepare($countSql);
        foreach ($params as $i => $val) {
            $type = is_int($val) ? PDO::PARAM_INT : PDO::PARAM_STR;
            $cStmt->bindValue($i + 1, $val, $type);
        }
        $cStmt->execute();
        [$totalCount, $totalAmount] = $cStmt->fetch(PDO::FETCH_NUM);

        echo json_encode([
            'data' => $rows,
            'total' => (int)$totalCount,
            'total_amount' => (float)$totalAmount,
            'limit' => $limit,
            'offset' => $offset,
        ]);
    }
}
