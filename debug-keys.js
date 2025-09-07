import { prisma } from './src/db/prisma.js';
import { decrypt } from './src/services/cryptoService.js';

async function debugApiKeys() {
  try {
    console.log('🔍 Checking all users and their API keys...\n');
    
  const users = await prisma.user.findMany({ include: { exchangeKeys: true } });
    console.log(`Found ${users.length} users:`);
    
    for (const user of users) {
      console.log(`\n👤 User: ${user.id}`);
      console.log(`📱 WhatsApp: ${user.whatsappNumber}`);
      console.log(`� Exchanges: ${user.exchangeKeys.length}`);
      for (const ex of user.exchangeKeys) {
        console.log(`  • ${ex.exchange}`);
        console.log(`    �🔐 Encrypted API Key: ${ex.encryptedApiKey.substring(0, 50)}...`);
        console.log(`    🔐 Encrypted API Secret: ${ex.encryptedApiSecret.substring(0, 50)}...`);
        try {
          const apiKey = decrypt(ex.encryptedApiKey);
          const apiSecret = decrypt(ex.encryptedApiSecret);
          console.log(`    ✅ API Key decrypted: ${apiKey.substring(0, 20)}...`);
          console.log(`    ✅ API Secret decrypted: ${apiSecret.substring(0, 20)}...`);
        } catch (decryptError) {
          console.log(`    ❌ Failed to decrypt keys: ${decryptError.message}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

debugApiKeys();
