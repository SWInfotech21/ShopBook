<?php
namespace App\Controllers;

use App\Core\Security;
use App\Models\Account;
use App\Models\AuditLog;

class AccountsController
{
    public function index(): void
    {
        Security::requireAuth(['admin', 'readonly_admin', 'user']);
        echo json_encode(Account::all());
    }

    public function create(): void
    {
        $auth = Security::requireAuth(['admin']);
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $name = trim($input['name'] ?? '');
        $type = $input['type'] ?? '';
        $opening = (float)($input['opening_balance'] ?? 0);
        if ($name === '' || !in_array($type, ['cash','bank','wallet'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid input']);
            return;
        }
        try {
            $id = Account::create([
                'name' => $name,
                'type' => $type,
                'opening_balance' => $opening,
                'current_balance' => $opening,
                'notes' => $input['notes'] ?? null,
            ]);
            AuditLog::add('accounts', $id, 'create', null, ['name' => $name, 'type' => $type], $auth['id']);
            echo json_encode(['id' => $id]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') {
                http_response_code(409);
                echo json_encode(['error' => 'Account name must be unique']);
            } else {
                http_response_code(500);
                echo json_encode(['error' => 'DB error']);
            }
        }
    }
}
