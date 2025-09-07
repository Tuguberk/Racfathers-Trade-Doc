import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { PromptService } from "../services/promptService.js";

const router = Router();

// Prompt management web interface
router.get("/prompts", async (req, res) => {
  try {
    const prompts = await PromptService.getAllPrompts();
    const categories = [...new Set(prompts.map((p) => p.category))];

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rac'fella - Agent Prompts Manager</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .prompt-card { transition: all 0.3s ease; }
        .prompt-card:hover { transform: translateY(-2px); }
        .category-tab.active { @apply bg-blue-500 text-white; }
        .category-tab { @apply bg-gray-200 text-gray-700 hover:bg-gray-300; }
    </style>
</head>
<body class="bg-gray-100 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">🧠 Rac'fella Agent Prompts</h1>
            <p class="text-gray-600">Manage AI agent prompts in real-time while the system is running</p>
        </div>

        <!-- Category Tabs -->
        <div class="flex flex-wrap gap-2 mb-6">
            <button onclick="showCategory('all')" class="category-tab active px-4 py-2 rounded-lg font-medium transition-colors">
                All (${prompts.length})
            </button>
            ${categories
              .map(
                (cat) => `
                <button onclick="showCategory('${cat}')" class="category-tab px-4 py-2 rounded-lg font-medium transition-colors">
                    ${cat.charAt(0).toUpperCase() + cat.slice(1)} (${
                  prompts.filter((p) => p.category === cat).length
                })
                </button>
            `
              )
              .join("")}
        </div>

        <!-- Prompts Grid -->
        <div id="prompts-container" class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            ${prompts
              .map(
                (prompt) => `
                <div class="prompt-card bg-white rounded-lg shadow-md p-6 ${
                  prompt.category
                }-category" data-category="${prompt.category}">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h3 class="text-lg font-semibold text-gray-900">${
                              prompt.title
                            }</h3>
                            <span class="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 mt-1">
                                ${prompt.category}
                            </span>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="togglePrompt('${prompt.id}')" 
                                class="px-2 py-1 text-xs rounded ${
                                  prompt.isActive
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }">
                                ${prompt.isActive ? "✅ Active" : "❌ Inactive"}
                            </button>
                        </div>
                    </div>
                    
                    <p class="text-sm text-gray-600 mb-4">${
                      prompt.description || "No description"
                    }</p>
                    
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Prompt Content:</label>
                        <textarea id="content-${
                          prompt.id
                        }" class="w-full h-32 p-3 border border-gray-300 rounded-md text-sm font-mono resize-none">${
                  prompt.content
                }</textarea>
                    </div>
                    
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-gray-500">Updated: ${new Date(
                          prompt.updatedAt
                        ).toLocaleDateString()}</span>
                        <button onclick="updatePrompt('${
                          prompt.id
                        }')" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm">
                            💾 Save Changes
                        </button>
                    </div>
                </div>
            `
              )
              .join("")}
        </div>
    </div>

    <script>
        let currentCategory = 'all';

        function showCategory(category) {
            currentCategory = category;
            const cards = document.querySelectorAll('.prompt-card');
            const tabs = document.querySelectorAll('.category-tab');
            
            // Update tab styles
            tabs.forEach(tab => {
                tab.classList.remove('active', 'bg-blue-500', 'text-white');
                tab.classList.add('bg-gray-200', 'text-gray-700');
            });
            event.target.classList.add('active', 'bg-blue-500', 'text-white');
            event.target.classList.remove('bg-gray-200', 'text-gray-700');
            
            // Show/hide cards
            cards.forEach(card => {
                if (category === 'all' || card.dataset.category === category) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        async function updatePrompt(id) {
            const content = document.getElementById(\`content-\${id}\`).value;
            
            try {
                const response = await fetch('/api/prompts/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
                
                if (response.ok) {
                    alert('✅ Prompt updated successfully!');
                } else {
                    alert('❌ Failed to update prompt');
                }
            } catch (error) {
                alert('❌ Error updating prompt: ' + error.message);
            }
        }

        async function togglePrompt(id) {
            try {
                const response = await fetch('/api/prompts/' + id + '/toggle', { method: 'POST' });
                if (response.ok) {
                    location.reload();
                } else {
                    alert('❌ Failed to toggle prompt');
                }
            } catch (error) {
                alert('❌ Error toggling prompt: ' + error.message);
            }
        }
    </script>
</body>
</html>`;

    res.send(html);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoints for prompt management
router.get("/api/prompts", async (req, res) => {
  try {
    const prompts = await PromptService.getAllPrompts();
    res.json(prompts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/prompts", async (req, res) => {
  try {
    const prompt = await PromptService.createPrompt(req.body);
    res.json(prompt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/api/prompts/:id", async (req, res) => {
  try {
    const prompt = await PromptService.updatePrompt(req.params.id, req.body);
    res.json(prompt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/prompts/:id/toggle", async (req, res) => {
  try {
    const prompt = await PromptService.togglePrompt(req.params.id);
    res.json(prompt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
