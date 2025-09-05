import { Router } from "express";
import { mainAgent } from "../agent/mainAgent.js";
import { AgentState } from "../agent/state.js";

const router = Router();

// Web-based Graph Visualizer
router.get("/graph-visualizer", (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Psy-Trader - Agent Graph Visualizer</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .node { cursor: pointer; }
        .node circle { stroke: #fff; stroke-width: 2px; }
        .node text { font-family: Arial, sans-serif; font-size: 12px; }
        .link { stroke: #999; stroke-opacity: 0.8; stroke-width: 2px; }
        .link.active { stroke: #ff6b6b; stroke-width: 3px; }
        .node.active circle { stroke: #ff6b6b; stroke-width: 4px; }
        .execution-log { background: #1e1e1e; color: #00ff00; font-family: monospace; }
    </style>
</head>
<body class="bg-gray-100">
    <div class="container mx-auto p-4">
        <!-- Header -->
        <div class="mb-6">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">🧠 Psy-Trader Agent Graph</h1>
            <p class="text-gray-600">Real-time visualization of your AI agent execution</p>
        </div>

        <!-- Control Panel -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <!-- Execution Control -->
            <div class="bg-white p-4 rounded-lg shadow">
                <h3 class="font-bold mb-3">🎮 Execute Agent</h3>
                <div class="mb-3">
                    <input type="text" id="userIdInput" placeholder="User ID" 
                           class="w-full p-2 border rounded mb-2" value="cmf6qrbgc0002xsx9bia6dg0t">
                    <textarea id="messageInput" placeholder="Enter message..." 
                              class="w-full p-2 border rounded h-20" 
                              >Show my portfolio and help me with my anxiety about losses</textarea>
                </div>
                <button id="executeBtn" onclick="executeAgent()" 
                        class="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded">
                    🚀 Execute Agent
                </button>
            </div>

            <!-- Graph Info -->
            <div class="bg-white p-4 rounded-lg shadow">
                <h3 class="font-bold mb-3">📊 Graph Statistics</h3>
                <div class="space-y-2">
                    <div class="flex justify-between">
                        <span class="text-gray-600">Nodes:</span>
                        <span class="font-bold">5</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Edges:</span>
                        <span class="font-bold">6</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Last Execution:</span>
                        <span id="lastExecution" class="font-bold text-sm">Never</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Execution Time:</span>
                        <span id="executionTime" class="font-bold">-</span>
                    </div>
                </div>
            </div>

            <!-- Current State -->
            <div class="bg-white p-4 rounded-lg shadow">
                <h3 class="font-bold mb-3">📋 Current State</h3>
                <div id="currentState" class="text-sm text-gray-600">
                    Ready to execute...
                </div>
            </div>
        </div>

        <!-- Graph Visualization -->
        <div class="bg-white p-6 rounded-lg shadow mb-6">
            <h3 class="font-bold mb-4">🔄 Agent Flow Diagram</h3>
            <div id="graphContainer" class="w-full" style="height: 500px;">
                <svg id="graph" width="100%" height="500"></svg>
            </div>
        </div>

        <!-- Execution Log -->
        <div class="bg-white rounded-lg shadow">
            <div class="p-4 border-b">
                <h3 class="font-bold">📝 Execution Log</h3>
                <button onclick="clearLog()" class="float-right text-sm text-red-500 hover:text-red-700">
                    Clear Log
                </button>
            </div>
            <div id="executionLog" class="execution-log p-4 h-64 overflow-y-auto text-sm">
                <div>🚀 Agent Graph Visualizer initialized...</div>
                <div>⏳ Ready for execution...</div>
            </div>
        </div>
    </div>

    <script>
        let currentExecution = null;
        let executionStartTime = null;

        // Graph data
        const nodes = [
            { id: "start", name: "START", type: "start", x: 100, y: 250 },
            { id: "retrieve", name: "User & History", type: "database", x: 250, y: 150 },
            { id: "portfolio", name: "Portfolio Analysis", type: "api", x: 400, y: 100 },
            { id: "intent", name: "Intent Analysis", type: "llm", x: 550, y: 200 },
            { id: "knowledge", name: "Knowledge Search", type: "vector", x: 700, y: 300 },
            { id: "response", name: "Response Gen", type: "llm", x: 850, y: 250 },
            { id: "end", name: "END", type: "end", x: 1000, y: 250 }
        ];

        const edges = [
            { source: "start", target: "retrieve" },
            { source: "retrieve", target: "portfolio" },
            { source: "portfolio", target: "intent" },
            { source: "intent", target: "knowledge" },
            { source: "knowledge", target: "response" },
            { source: "response", target: "end" }
        ];

        // Initialize D3 visualization
        function initGraph() {
            const svg = d3.select("#graph");
            const width = document.getElementById("graphContainer").offsetWidth;
            const height = 500;

            svg.attr("width", width).attr("height", height);

            // Draw edges
            svg.selectAll(".link")
                .data(edges)
                .enter()
                .append("line")
                .attr("class", "link")
                .attr("x1", d => nodes.find(n => n.id === d.source).x)
                .attr("y1", d => nodes.find(n => n.id === d.source).y)
                .attr("x2", d => nodes.find(n => n.id === d.target).x)
                .attr("y2", d => nodes.find(n => n.id === d.target).y);

            // Draw nodes
            const nodeGroups = svg.selectAll(".node")
                .data(nodes)
                .enter()
                .append("g")
                .attr("class", "node")
                .attr("transform", d => \`translate(\${d.x},\${d.y})\`);

            nodeGroups.append("circle")
                .attr("r", d => d.type === "start" || d.type === "end" ? 20 : 30)
                .attr("fill", d => {
                    switch(d.type) {
                        case "start": return "#4ade80";
                        case "end": return "#ef4444";
                        case "database": return "#3b82f6";
                        case "api": return "#f59e0b";
                        case "llm": return "#8b5cf6";
                        case "vector": return "#06b6d4";
                        default: return "#6b7280";
                    }
                });

            nodeGroups.append("text")
                .attr("text-anchor", "middle")
                .attr("dy", "0.35em")
                .style("fill", "white")
                .style("font-size", "10px")
                .style("font-weight", "bold")
                .text(d => d.name);

            // Add node labels below
            nodeGroups.append("text")
                .attr("text-anchor", "middle")
                .attr("dy", "50")
                .style("fill", "#374151")
                .style("font-size", "12px")
                .text(d => d.name);
        }

        // Execute agent
        async function executeAgent() {
            const userId = document.getElementById('userIdInput').value;
            const message = document.getElementById('messageInput').value;
            
            if (!userId || !message) {
                alert('Please provide both User ID and message');
                return;
            }

            const executeBtn = document.getElementById('executeBtn');
            executeBtn.disabled = true;
            executeBtn.textContent = '⏳ Executing...';
            
            executionStartTime = Date.now();
            addLog(\`🚀 Starting execution for user: \${userId}\`);
            addLog(\`📝 Message: "\${message}"\`);

            try {
                // Animate graph execution
                animateExecution();

                const response = await fetch('/studio/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, inputMessage: message })
                });

                const result = await response.json();
                
                if (result.success) {
                    const executionTime = Date.now() - executionStartTime;
                    document.getElementById('executionTime').textContent = \`\${executionTime}ms\`;
                    document.getElementById('lastExecution').textContent = new Date().toLocaleTimeString();
                    
                    addLog(\`✅ Execution completed in \${result.execution_time_ms}ms\`);
                    addLog(\`📊 Steps executed: \${result.steps_executed}\`);
                    addLog(\`💭 Response: \${result.response.substring(0, 100)}...\`);
                    
                    // Update current state
                    document.getElementById('currentState').innerHTML = \`
                        <div class="text-green-600 font-bold">✅ Completed</div>
                        <div class="text-xs mt-1">Response: \${result.response.substring(0, 60)}...</div>
                    \`;
                } else {
                    addLog(\`❌ Execution failed: \${result.error}\`);
                    document.getElementById('currentState').innerHTML = \`
                        <div class="text-red-600 font-bold">❌ Failed</div>
                        <div class="text-xs mt-1">\${result.error}</div>
                    \`;
                }
                
            } catch (error) {
                addLog(\`💥 Error: \${error.message}\`);
                document.getElementById('currentState').innerHTML = \`
                    <div class="text-red-600 font-bold">💥 Error</div>
                    <div class="text-xs mt-1">\${error.message}</div>
                \`;
            } finally {
                executeBtn.disabled = false;
                executeBtn.textContent = '🚀 Execute Agent';
                resetAnimation();
            }
        }

        // Animate execution
        function animateExecution() {
            const sequence = ["start", "retrieve", "portfolio", "intent", "knowledge", "response", "end"];
            let step = 0;

            const animate = () => {
                if (step < sequence.length) {
                    // Highlight current node
                    d3.selectAll(".node circle").classed("active", false);
                    d3.selectAll(".link").classed("active", false);
                    
                    const currentNode = sequence[step];
                    d3.selectAll(".node").filter(d => d.id === currentNode)
                        .select("circle").classed("active", true);
                    
                    // Highlight incoming edge
                    if (step > 0) {
                        const prevNode = sequence[step - 1];
                        d3.selectAll(".link").filter(d => d.source === prevNode && d.target === currentNode)
                            .classed("active", true);
                    }
                    
                    addLog(\`🔄 Executing: \${nodes.find(n => n.id === currentNode).name}\`);
                    step++;
                    setTimeout(animate, 800);
                }
            };
            
            animate();
        }

        // Reset animation
        function resetAnimation() {
            d3.selectAll(".node circle").classed("active", false);
            d3.selectAll(".link").classed("active", false);
        }

        // Add log entry
        function addLog(message) {
            const log = document.getElementById('executionLog');
            const timestamp = new Date().toLocaleTimeString();
            log.innerHTML += \`<div>[\${timestamp}] \${message}</div>\`;
            log.scrollTop = log.scrollHeight;
        }

        // Clear log
        function clearLog() {
            document.getElementById('executionLog').innerHTML = '';
            addLog('🧹 Log cleared');
        }

        // Initialize on load
        window.addEventListener('load', () => {
            initGraph();
            addLog('📊 Graph visualization ready');
        });

        // Responsive resize
        window.addEventListener('resize', () => {
            setTimeout(initGraph, 100);
        });
    </script>
</body>
</html>`;

  res.send(html);
});

export default router;
