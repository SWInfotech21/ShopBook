<?php
namespace App\Models;

use App\Core\Database;
use PDO;

class Transaction
{
    public static function create(array $data): int
    {
        $sql = 'INSERT INTO transactions (transaction_ref, type, amount, commission_amount, commission_account_id, received_in_account_id, debit_from_account_id, option_pay_later, remarks, created_by) VALUES (?,?,?,?,?,?,?,?,?,?)';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute([
            $data['transaction_ref'],
            $data['type'],
            $data['amount'],
            $data['commission_amount'] ?? 0,
            $data['commission_account_id'] ?? null,
            $data['received_in_account_id'] ?? null,
            $data['debit_from_account_id'] ?? null,
            $data['option_pay_later'] ?? 0,
            $data['remarks'] ?? null,
            $data['created_by'],
        ]);
        return (int)Database::pdo()->lastInsertId();
    }
}
