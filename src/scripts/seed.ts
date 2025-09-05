import { prisma } from '../db/prisma.js';
import { getEmbedding } from '../services/llmService.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const file = path.resolve(process.cwd(), 'data/knowledge.json');
  const raw = fs.readFileSync(file, 'utf8');
  const items: Array<{ content: string; author?: string; source?: string; tags?: string[] }> = JSON.parse(raw);

  for (const item of items) {
    const rec = await prisma.knowledgeArticle.create({
      data: {
        content: item.content,
        author: item.author,
        source: item.source,
        tags: item.tags || []
      }
    });

    const emb = await getEmbedding(item.content);
    const vectorLiteral = `[${emb.join(',')}]`;

    // Update embedding via raw SQL. Rely on pgvector string input cast.
    await prisma.$executeRawUnsafe(
      `UPDATE "KnowledgeArticle" SET embedding = '${vectorLiteral}'::vector WHERE id = $1`,
      rec.id
    );

    // eslint-disable-next-line no-console
    console.log(`Seeded article ${rec.id}`);
  }

  // eslint-disable-next-line no-console
  console.log('Seeding complete');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
