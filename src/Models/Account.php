<?php
namespace App\Models;

use App\Core\Database;
use PDO;

class Account
{
    public static function all(): array
    {
        $stmt = Database::pdo()->query('SELECT * FROM accounts ORDER BY id');
        return $stmt->fetchAll();
    }

    public static function create(array $data): int
    {
        $stmt = Database::pdo()->prepare('INSERT INTO accounts (name, type, opening_balance, current_balance, notes) VALUES (?,?,?,?,?)');
        $stmt->execute([
            $data['name'],
            $data['type'],
            $data['opening_balance'] ?? 0,
            $data['current_balance'] ?? 0,
            $data['notes'] ?? null,
        ]);
        return (int)Database::pdo()->lastInsertId();
    }
}
