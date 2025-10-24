<?php
namespace App\Core;

use App\Core\Security;

class Router
{
    private array $routes = [
        'GET' => [],
        'POST' => [],
        'PUT' => [],
        'DELETE' => [],
    ];

    public function get(string $path, $handler): void { $this->routes['GET'][$path] = $handler; }
    public function post(string $path, $handler): void { $this->routes['POST'][$path] = $handler; }
    public function put(string $path, $handler): void { $this->routes['PUT'][$path] = $handler; }
    public function delete(string $path, $handler): void { $this->routes['DELETE'][$path] = $handler; }

    public function dispatch(): void
    {
        header('Content-Type: application/json');
        $method = $_SERVER['REQUEST_METHOD'];
        $uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        // Determine base path. If script is under /public, use its parent as base (e.g., /rehan)
        $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
        $base = rtrim($scriptDir, '/');
        if (basename($scriptDir) === 'public') {
            $base = rtrim(dirname($scriptDir), '/');
        }
        $path = '/' . ltrim(substr($uri, strlen($base)), '/');

        foreach ($this->routes[$method] ?? [] as $route => $handler) {
            $pattern = '#^' . $route . '$#';
            if (preg_match($pattern, $path, $matches)) {
                array_shift($matches);
                $this->handle($handler, $matches);
                return;
            }
        }
        http_response_code(404);
        echo json_encode(['error' => 'Not Found']);
    }

    private function handle($handler, array $params): void
    {
        [$class, $method] = $handler;
        $controller = new $class();
        call_user_func_array([$controller, $method], $params);
    }
}
