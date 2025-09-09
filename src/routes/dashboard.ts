import express from "express";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// Dashboard/Homepage route - protected with password auth
router.get("/", requireAuth, (req, res) => {
  const dashboardHTML = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rac'fella Dashboard</title>
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
            padding: 20px;
        }
        
        .dashboard-container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }
        
        .header {
            text-align: center;
            margin-bottom: 50px;
        }
        
        .header h1 {
            color: #2c3e50;
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 300;
        }
        
        .header p {
            color: #7f8c8d;
            font-size: 1.2em;
        }
        
        .cards-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 30px;
            margin-bottom: 40px;
        }
        
        .card {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            border-left: 5px solid;
        }
        
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.15);
        }
        
        .card.prompts {
            border-left-color: #e74c3c;
        }
        
        .card.knowledge {
            border-left-color: #3498db;
        }
        
        .card.visualizer {
            border-left-color: #2ecc71;
        }
        
        .card-icon {
            font-size: 2.5em;
            margin-bottom: 15px;
            display: block;
        }
        
        .prompts .card-icon { color: #e74c3c; }
        .knowledge .card-icon { color: #3498db; }
        .visualizer .card-icon { color: #2ecc71; }
        
        .card h3 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 1.4em;
        }
        
        .card p {
            color: #7f8c8d;
            margin-bottom: 20px;
            line-height: 1.6;
        }
        
        .card-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            padding: 12px 25px;
            border-radius: 25px;
            font-weight: 500;
            transition: transform 0.3s ease, opacity 0.3s ease;
        }
        
        .card-button:hover {
            transform: scale(1.05);
            opacity: 0.9;
        }
        
        .status-section {
            background: #f8f9fa;
            border-radius: 15px;
            padding: 30px;
            margin-top: 30px;
        }
        
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        
        .status-item {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
        }
        
        .status-item h4 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        
        .status-value {
            font-size: 1.5em;
            font-weight: bold;
            color: #27ae60;
        }
        
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 30px;
            border-top: 1px solid #ecf0f1;
            color: #7f8c8d;
        }
        
        @media (max-width: 768px) {
            .cards-grid {
                grid-template-columns: 1fr;
            }
            
            .dashboard-container {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2em;
            }
        }
    </style>
</head>
<body>
    <div class="dashboard-container">
        <div class="header">
            <h1>🤖 Rac'fella Dashboard</h1>
            <p>AI-Powered Trading Agent Management System</p>
            <div style="margin-top: 10px; padding: 8px 16px; background: #e8f5e8; border-radius: 8px; font-size: 14px; color: #2d5a2d;">
                🔐 <strong>Authenticated Access</strong> - You are logged in to the admin panel
            </div>
        </div>
        
        <div class="cards-grid">
            <div class="card prompts">
                <span class="card-icon">🧠</span>
                <h3>Agent Prompts</h3>
                <p>AI agent'ınızın davranışlarını ve yanıtlarını yönetin. Sistem, analiz, risk yönetimi ve karar verme prompt'larını düzenleyin.</p>
                <a href="/prompts" class="card-button">Prompt Yönetimi</a>
            </div>
            
            <div class="card knowledge">
                <span class="card-icon">📚</span>
                <h3>Knowledge Base</h3>
                <p>Trading stratejileri, piyasa analizleri ve finansal bilgiler için bilgi tabanını yönetin. AI agent'ının öğrenme kaynağı.</p>
                <a href="/knowledge" class="card-button">Bilgi Tabanı</a>
            </div>
            
            <div class="card visualizer">
                <span class="card-icon">📊</span>
                <h3>Agent Graph Visualizer</h3>
                <p>AI agent'ınızın çalışma akışını gerçek zamanlı olarak görselleştirin. Node'ları, bağlantıları ve execution flow'u izleyin.</p>
                <a href="/graph-visualizer" class="card-button">Grafiği Görüntüle</a>
            </div>
        </div>
        
        <div class="status-section">
            <h2 style="text-align: center; margin-bottom: 30px; color: #2c3e50;">📈 Sistem Durumu</h2>
            <div class="status-grid">
                <div class="status-item">
                    <h4>Server Status</h4>
                    <div class="status-value" id="server-status">🟢 Online</div>
                </div>
                <div class="status-item">
                    <h4>Database</h4>
                    <div class="status-value" id="db-status">🔄 Checking...</div>
                </div>
                <div class="status-item">
                    <h4>AI Agent</h4>
                    <div class="status-value" id="agent-status">🤖 Ready</div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>© 2025 Rac'fella - AI-Powered Trading Intelligence System</p>
            <p>Built with LangGraph, Node.js, and PostgreSQL</p>
        </div>
    </div>
    
    <script>
        // Check database status
        fetch('/health')
            .then(response => response.json())
            .then(data => {
                const dbStatus = document.getElementById('db-status');
                if (data.ok) {
                    dbStatus.innerHTML = '🟢 Healthy';
                    dbStatus.style.color = '#27ae60';
                } else {
                    dbStatus.innerHTML = '🔴 Error';
                    dbStatus.style.color = '#e74c3c';
                }
            })
            .catch(() => {
                document.getElementById('db-status').innerHTML = '🔴 Offline';
                document.getElementById('db-status').style.color = '#e74c3c';
            });
            
        // Add some interactivity
        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', function() {
                const button = this.querySelector('.card-button');
                if (button) {
                    window.location.href = button.href;
                }
            });
        });
    </script>
</body>
</html>`;

  res.send(dashboardHTML);
});

// Handle POST requests for authentication (redirect to GET after auth)
router.post("/", requireAuth, (req, res) => {
  res.redirect("/");
});

export default router;
