import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { getEmbedding } from "../services/llmService.js";

const router = Router();

// Helper function to get knowledge base statistics
async function getKnowledgeStats() {
  const total = await prisma.knowledgeArticle.count();

  const recentCount = await prisma.knowledgeArticle.count();

  // Get most common tag
  const tagStats: Array<{ tag: string; count: bigint }> =
    await prisma.$queryRaw`
    SELECT unnest(tags) as tag, COUNT(*) as count 
    FROM "KnowledgeArticle" 
    WHERE array_length(tags, 1) > 0
    GROUP BY tag 
    ORDER BY count DESC 
    LIMIT 1
  `;

  return {
    total,
    latestCount: recentCount,
    topTag: tagStats.length > 0 ? tagStats[0].tag : null,
    topTagCount: tagStats.length > 0 ? Number(tagStats[0].count) : 0,
  };
}

// Knowledge management web interface
router.get("/knowledge", async (req, res) => {
  try {
    const articles = await prisma.knowledgeArticle.findMany({
      orderBy: { id: "desc" },
      take: 20,
    });

    const stats = await getKnowledgeStats();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Psy-Trader - Knowledge Base Manager</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        .article-card { transition: all 0.3s ease; }
        .article-card:hover { transform: translateY(-2px); }
        .search-result { background: #fffbeb; border-left: 4px solid #f59e0b; }
    </style>
</head>
<body class="bg-gray-100 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <!-- Header -->
        <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">📚 Knowledge Base Manager</h1>
            <p class="text-gray-600">Add articles and search with AI embeddings</p>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div class="bg-white p-4 rounded-lg shadow">
                <h3 class="text-sm font-medium text-gray-500">Total Articles</h3>
                <p class="text-2xl font-bold text-blue-600">${stats.total}</p>
            </div>
            <div class="bg-white p-4 rounded-lg shadow">
                <h3 class="text-sm font-medium text-gray-500">Top Tag</h3>
                <p class="text-2xl font-bold text-green-600">${
                  stats.topTag || "None"
                }</p>
            </div>
            <div class="bg-white p-4 rounded-lg shadow">
                <h3 class="text-sm font-medium text-gray-500">Latest Added</h3>
                <p class="text-2xl font-bold text-purple-600">${
                  stats.latestCount
                }</p>
            </div>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <!-- Add Article -->
            <div class="bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-bold mb-4">➕ Add New Article</h2>
                <form onsubmit="addArticle(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Content:</label>
                        <textarea id="articleContent" class="w-full h-32 p-3 border border-gray-300 rounded-md" 
                                  placeholder="Enter trading psychology advice, tips, or knowledge..." required></textarea>
                    </div>
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Author:</label>
                            <input type="text" id="articleAuthor" class="w-full p-2 border border-gray-300 rounded-md" 
                                   placeholder="Author name">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Source:</label>
                            <input type="text" id="articleSource" class="w-full p-2 border border-gray-300 rounded-md" 
                                   placeholder="Book, website, etc.">
                        </div>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Tags (comma separated):</label>
                        <input type="text" id="articleTags" class="w-full p-2 border border-gray-300 rounded-md" 
                               placeholder="psychology, trading, risk, emotion">
                    </div>
                    <button type="submit" class="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg">
                        🧠 Create Article & Generate Embedding
                    </button>
                </form>
            </div>

            <!-- Search Articles -->
            <div class="bg-white p-6 rounded-lg shadow">
                <h2 class="text-xl font-bold mb-4">🔍 Search Knowledge Base</h2>
                <form onsubmit="searchArticles(event)">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Search Query:</label>
                        <textarea id="searchQuery" class="w-full h-32 p-3 border border-gray-300 rounded-md" 
                                  placeholder="Enter your search query... e.g. 'How to handle FOMO in trading?'" required></textarea>
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Results Limit:</label>
                        <select id="searchLimit" class="w-full p-2 border border-gray-300 rounded-md">
                            <option value="3">3 results</option>
                            <option value="5" selected>5 results</option>
                            <option value="10">10 results</option>
                        </select>
                    </div>
                    <button type="submit" class="w-full bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg">
                        🎯 Search with AI Embeddings
                    </button>
                </form>
                
                <!-- Search Results -->
                <div id="searchResults" class="mt-6 space-y-4" style="display: none;">
                    <h3 class="text-lg font-semibold text-gray-800">Search Results:</h3>
                    <div id="resultsContainer"></div>
                </div>
            </div>
        </div>

        <!-- Articles List -->
        <div class="bg-white rounded-lg shadow">
            <div class="p-6 border-b border-gray-200">
                <h2 class="text-xl font-bold">📄 Recent Articles (${
                  articles.length
                })</h2>
            </div>
            <div class="p-6">
                <div class="grid gap-4">
                    ${articles
                      .slice(0, 10)
                      .map(
                        (article: any, index: number) => `
                        <div class="article-card bg-gray-50 p-4 rounded-lg border">
                            <div class="flex justify-between items-start mb-2">
                                <span class="text-sm text-gray-500">#${
                                  index + 1
                                } • ${article.author || "Unknown"}</span>
                                <span class="text-xs text-gray-400">ID: ${article.id.substring(
                                  0,
                                  8
                                )}</span>
                            </div>
                            <p class="text-gray-800 mb-2">${
                              article.content.length > 200
                                ? article.content.substring(0, 200) + "..."
                                : article.content
                            }</p>
                            <div class="flex flex-wrap gap-1">
                                ${(article.tags || [])
                                  .map(
                                    (tag: string) => `
                                    <span class="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">${tag}</span>
                                `
                                  )
                                  .join("")}
                            </div>
                        </div>
                    `
                      )
                      .join("")}
                </div>
                ${
                  articles.length > 10
                    ? `
                    <div class="mt-4 text-center">
                        <p class="text-gray-500">... and ${
                          articles.length - 10
                        } more articles</p>
                    </div>
                `
                    : ""
                }
            </div>
        </div>
    </div>

    <script>
        let isLoading = false;

        async function addArticle(event) {
            event.preventDefault();
            
            if (isLoading) return;
            isLoading = true;
            
            const submitBtn = event.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = '⏳ Creating embedding...';
            submitBtn.disabled = true;
            
            const data = {
                content: document.getElementById('articleContent').value,
                author: document.getElementById('articleAuthor').value || 'Unknown',
                source: document.getElementById('articleSource').value || 'Manual Entry',
                tags: document.getElementById('articleTags').value.split(',').map(t => t.trim()).filter(t => t)
            };
            
            try {
                const response = await fetch('/api/knowledge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    alert('✅ Article added successfully with embedding!');
                    
                    // Reset form
                    document.getElementById('articleContent').value = '';
                    document.getElementById('articleAuthor').value = '';
                    document.getElementById('articleSource').value = '';
                    document.getElementById('articleTags').value = '';
                    
                    // Refresh page after a delay
                    setTimeout(() => location.reload(), 1000);
                } else {
                    const error = await response.text();
                    alert('❌ Failed to add article: ' + error);
                }
            } catch (error) {
                alert('❌ Error adding article: ' + error.message);
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                isLoading = false;
            }
        }

        async function searchArticles(event) {
            event.preventDefault();
            
            if (isLoading) return;
            isLoading = true;
            
            const submitBtn = event.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = '🔍 Searching...';
            submitBtn.disabled = true;
            
            const query = document.getElementById('searchQuery').value;
            const limit = document.getElementById('searchLimit').value;
            
            try {
                const response = await fetch('/api/knowledge/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query, limit: parseInt(limit) })
                });
                
                if (response.ok) {
                    const results = await response.json();
                    displaySearchResults(results);
                } else {
                    const error = await response.text();
                    alert('❌ Search failed: ' + error);
                }
            } catch (error) {
                alert('❌ Search error: ' + error.message);
            } finally {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                isLoading = false;
            }
        }

        function displaySearchResults(results) {
            const searchResults = document.getElementById('searchResults');
            const resultsContainer = document.getElementById('resultsContainer');
            
            if (results.length === 0) {
                resultsContainer.innerHTML = '<p class="text-gray-500">No results found.</p>';
            } else {
                resultsContainer.innerHTML = results.map((result, index) => \`
                    <div class="search-result p-4 rounded-lg">
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-sm font-medium text-orange-600">Result #\${index + 1} • \${result.author || 'Unknown'}</span>
                            <span class="text-xs text-gray-500">Similarity: \${(result.similarity || 0.8).toFixed(3)}</span>
                        </div>
                        <p class="text-gray-800 mb-2">\${result.content}</p>
                        <div class="flex flex-wrap gap-1">
                            \${(result.tags || []).map(tag => \`
                                <span class="inline-block px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">\${tag}</span>
                            \`).join('')}
                        </div>
                        \${result.source ? \`<p class="text-xs text-gray-500 mt-2">Source: \${result.source}</p>\` : ''}
                    </div>
                \`).join('');
            }
            
            searchResults.style.display = 'block';
        }
    </script>
</body>
</html>`;

    res.send(html);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API: Add new article with embedding
router.post("/api/knowledge", async (req, res) => {
  try {
    const { content, author, source, tags } = req.body;

    if (!content || content.trim().length < 10) {
      return res
        .status(400)
        .json({ error: "Content must be at least 10 characters long" });
    }

    // Create article record
    const article = await prisma.knowledgeArticle.create({
      data: {
        content: content.trim(),
        author: author || "Unknown",
        source: source || "Manual Entry",
        tags: Array.isArray(tags) ? tags : [],
      },
    });

    // Generate embedding
    console.log(`🧠 Generating embedding for article: ${article.id}`);
    const embedding = await getEmbedding(content.trim());
    const vectorLiteral = `[${embedding.join(",")}]`;

    // Update with embedding
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgeArticle" SET embedding = '${vectorLiteral}'::vector WHERE id = $1`,
      article.id
    );

    console.log(`✅ Article created with embedding: ${article.id}`);

    res.json({
      success: true,
      article: {
        id: article.id,
        content: article.content.substring(0, 100) + "...",
        author: article.author,
        tags: article.tags,
        embeddingSize: embedding.length,
      },
    });
  } catch (error: any) {
    console.error("❌ Error creating article:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Search articles by embedding similarity
router.post("/api/knowledge/search", async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query || query.trim().length < 3) {
      return res
        .status(400)
        .json({ error: "Query must be at least 3 characters long" });
    }

    console.log(`🔍 Searching knowledge base for: "${query}"`);

    // Generate query embedding
    const queryEmbedding = await getEmbedding(query.trim());
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;

    // Search with cosine similarity
    const results: Array<{
      id: string;
      content: string;
      author?: string;
      source?: string;
      tags: string[];
      similarity?: number;
    }> = await prisma.$queryRawUnsafe(`
      SELECT 
        id, content, author, source, tags,
        1 - (embedding <-> '${vectorLiteral}'::vector) as similarity
      FROM "KnowledgeArticle" 
      WHERE embedding IS NOT NULL
      ORDER BY embedding <-> '${vectorLiteral}'::vector 
      LIMIT ${Math.min(limit, 20)}
    `);

    console.log(`📖 Found ${results.length} similar articles`);

    // Format results
    const formattedResults = results.map((result, index) => ({
      id: result.id,
      content: result.content,
      author: result.author,
      source: result.source,
      tags: result.tags || [],
      similarity: result.similarity || 0,
      rank: index + 1,
    }));

    res.json(formattedResults);
  } catch (error: any) {
    console.error("❌ Error searching articles:", error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get knowledge base statistics
router.get("/api/knowledge/stats", async (req, res) => {
  try {
    const stats = await getKnowledgeStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
