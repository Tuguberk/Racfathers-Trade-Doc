import { Request, Response, NextFunction } from "express";

// Simple password from environment variable, fallback to a default
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "racfella123";

// Store authenticated sessions (in production, use Redis or proper session store)
const authenticatedSessions = new Set<string>();

// Generate a simple session ID
function generateSessionId(req: Request): string {
  return `${req.ip}-${req.headers["user-agent"] || "unknown"}`;
}

// Middleware to protect routes with basic password authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = generateSessionId(req);

  // Check if already authenticated in this session
  if (authenticatedSessions.has(sessionId)) {
    return next();
  }

  // Check if password is provided in the request (safely handle undefined req.body)
  const password = req.query.password || (req.body && req.body.password);

  if (password === ADMIN_PASSWORD) {
    authenticatedSessions.add(sessionId);

    // If password was provided via query parameter, redirect to clean URL
    if (req.query.password) {
      return res.redirect(req.path);
    }

    return next();
  }

  // Show password prompt page
  const loginHTML = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔐 Giriş Gerekli - Rac'fella</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .login-container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 400px;
            width: 100%;
        }
        
        .logo {
            font-size: 3em;
            margin-bottom: 20px;
        }
        
        h1 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 1.8em;
            font-weight: 300;
        }
        
        p {
            color: #7f8c8d;
            margin-bottom: 30px;
            font-size: 1em;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        input[type="password"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #ecf0f1;
            border-radius: 10px;
            font-size: 16px;
            outline: none;
            transition: all 0.3s ease;
        }
        
        input[type="password"]:focus {
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        button {
            width: 100%;
            padding: 15px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        
        button:active {
            transform: translateY(0);
        }
        
        .error {
            color: #e74c3c;
            margin-top: 15px;
            font-size: 14px;
        }

        .quick-auth {
            margin-top: 20px;
            padding: 15px;
            background: rgba(102, 126, 234, 0.1);
            border-radius: 10px;
            font-size: 12px;
            color: #667eea;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🏛️</div>
        <h1>Giriş Gerekli</h1>
        <p>Bu sayfaya erişmek için şifre gereklidir</p>
        
        <form method="POST" action="${req.originalUrl}">
            <div class="form-group">
                <input type="password" name="password" placeholder="Şifre girin..." required autofocus>
            </div>
            <button type="submit">🚀 Giriş Yap</button>
        </form>
        
        ${
          password
            ? '<div class="error">❌ Yanlış şifre! Tekrar deneyin.</div>'
            : ""
        }
    </div>

    <script>
        // Auto-focus password field
        document.querySelector('input[type="password"]').focus();
        
        // Handle Enter key
        document.querySelector('input[type="password"]').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.target.closest('form').submit();
            }
        });

        // Simple client-side alternative using prompt (as requested)
        function promptAuth() {
            const password = prompt('🔐 Giriş için şifre girin:');
            if (password) {
                window.location.href = window.location.pathname + '?password=' + encodeURIComponent(password);
            }
        }

        // Add a button for JavaScript prompt method
        setTimeout(() => {
            const container = document.querySelector('.login-container');
            const jsButton = document.createElement('button');
            jsButton.textContent = '💬 JavaScript Prompt ile Giriş';
            jsButton.style.marginTop = '10px';
            jsButton.style.background = '#34495e';
            jsButton.onclick = promptAuth;
            container.appendChild(jsButton);
        }, 1000);
    </script>
</body>
</html>`;

  res.send(loginHTML);
}

// Optional: Function to clear all sessions (for development/testing)
export function clearAllSessions() {
  authenticatedSessions.clear();
  console.log("🧹 All authentication sessions cleared");
}
