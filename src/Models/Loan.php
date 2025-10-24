<?php
namespace App\Models;

use App\Core\Database;

class Loan
{
    public static function create(int $transactionId, string $partyName = null, float $amount = 0, ?string $dueDate = null): int
    {
        $stmt = Database::pdo()->prepare('INSERT INTO loans (transaction_id, party_name, amount, due_date, status, created_at) VALUES (?,?,?,?,?,NOW())');
        $stmt->execute([$transactionId, $partyName, $amount, $dueDate, 'open']);
        return (int)Database::pdo()->lastInsertId();
    }
}
