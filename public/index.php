<?php
declare(strict_types=1);

session_start([
    'cookie_httponly' => true,
    'use_strict_mode' => true,
]);

require_once __DIR__ . '/../src/config.php';
require_once __DIR__ . '/../src/Core/Autoload.php';

use App\Core\Router;
use App\Controllers\AuthController;
use App\Controllers\AccountsController;
use App\Controllers\TransactionsController;
use App\Controllers\ReportsController;
use App\Controllers\UsersController;
use App\Controllers\LoansController;

$router = new Router();

// Public endpoints
$router->post('/api/login', [AuthController::class, 'login']);
$router->get('/api/me', [AuthController::class, 'me']);
$router->post('/api/logout', [AuthController::class, 'logout']);
$router->post('/api/forgot-password', [AuthController::class, 'forgotPassword']);
$router->post('/api/reset-password', [AuthController::class, 'resetPassword']);

// Protected endpoints
$router->get('/api/accounts', [AccountsController::class, 'index']);
$router->post('/api/accounts', [AccountsController::class, 'create']);

$router->post('/api/transactions', [TransactionsController::class, 'create']);
$router->get('/api/transactions', [TransactionsController::class, 'recent']);
// One Way single-line transactions
$router->post('/api/transactions/oneway', [TransactionsController::class, 'oneway']);

$router->get('/api/reports/day-summary', [ReportsController::class, 'daySummary']);
$router->get('/api/reports/ledger', [ReportsController::class, 'ledger']);
$router->get('/api/reports/commissions', [ReportsController::class, 'commissions']);

// Loans (Pay Later)
$router->get('/api/loans', [LoansController::class, 'recent']);

$router->get('/api/users', [UsersController::class, 'index']);
$router->post('/api/users', [UsersController::class, 'create']);
$router->put('/api/users/(\d+)', [UsersController::class, 'update']);
$router->delete('/api/users/(\d+)', [UsersController::class, 'delete']);

// Authenticated user endpoints
$router->post('/api/change-password', [AuthController::class, 'changePassword']);

$router->dispatch();
