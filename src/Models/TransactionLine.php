<?php
namespace App\Models;

use App\Core\Database;

class TransactionLine
{
    public static function add(int $transactionId, int $accountId, string $direction, float $amount, ?string $notes = null): void
    {
        $stmt = Database::pdo()->prepare('INSERT INTO transaction_lines (transaction_id, account_id, direction, amount, notes) VALUES (?,?,?,?,?)');
        $stmt->execute([$transactionId, $accountId, $direction, $amount, $notes]);
    }
}
