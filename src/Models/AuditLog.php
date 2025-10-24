<?php
namespace App\Models;

use App\Core\Database;

class AuditLog
{
    public static function add(string $entity, int $entityId, string $action, $oldValue, $newValue, int $performedBy): void
    {
        $stmt = Database::pdo()->prepare('INSERT INTO audit_logs (entity, entity_id, action, old_value, new_value, performed_by) VALUES (?,?,?,?,?,?)');
        $stmt->execute([$entity, $entityId, $action, json_encode($oldValue), json_encode($newValue), $performedBy]);
    }
}
