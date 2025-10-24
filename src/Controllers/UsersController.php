<?php
namespace App\Controllers;

use App\Core\Security;
use App\Models\User;
use App\Models\AuditLog;

class UsersController
{
    public function index(): void
    {
        Security::requireAuth(['admin']);
        echo json_encode(User::all());
    }
    public function create(): void
    {
        $auth = Security::requireAuth(['admin']);
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($input['username']) || empty($input['password']) || empty($input['role'])) {
            http_response_code(400);
            echo json_encode(['error' => 'username, password, role required']);
            return;
        }
        $hash = password_hash($input['password'], PASSWORD_DEFAULT);
        $id = User::create([
            'username' => $input['username'],
            'password_hash' => $hash,
            'role' => $input['role'],
            'active' => (int)($input['active'] ?? 1),
            'allowed_time_start' => $input['allowed_time_start'] ?? null,
            'allowed_time_end' => $input['allowed_time_end'] ?? null,
            'email' => $input['email'] ?? null,
        ]);
        AuditLog::add('users', $id, 'create', null, ['username'=>$input['username'],'role'=>$input['role']], $auth['id']);
        echo json_encode(['id' => $id]);
    }

    public function update(int $id): void
    {
        $auth = Security::requireAuth(['admin']);
        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        if (!isset($input['role'], $input['active'], $input['allowed_time_start'], $input['allowed_time_end'])) {
            http_response_code(400);
            echo json_encode(['error' => 'role, active, allowed_time_start, allowed_time_end required']);
            return;
        }
        User::update($id, $input);
        AuditLog::add('users', $id, 'update', null, $input, $auth['id']);
        echo json_encode(['updated' => true]);
    }

    public function delete(int $id): void
    {
        $auth = Security::requireAuth(['admin']);
        if ($id === (int)$auth['id']) {
            http_response_code(400);
            echo json_encode(['error' => 'Cannot delete own user']);
            return;
        }
        $before = User::findById($id);
        if (!$before) { http_response_code(404); echo json_encode(['error'=>'User not found']); return; }
        if (($before['role'] ?? '') === 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Cannot delete admin users']);
            return;
        }
        User::delete($id);
        AuditLog::add('users', $id, 'delete', $before, null, $auth['id']);
        echo json_encode(['deleted' => true]);
    }
}
