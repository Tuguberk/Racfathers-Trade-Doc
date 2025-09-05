import { prisma } from './src/db/prisma.js';
import { decrypt } from './src/services/cryptoService.js';

async function debugApiKeys() {
  try {
    console.log('🔍 Checking all users and their API keys...\n');
    
    const users = await prisma.user.findMany();
    console.log(`Found ${users.length} users:`);
    
    for (const user of users) {
      console.log(`\n👤 User: ${user.id}`);
      console.log(`📱 WhatsApp: ${user.whatsappNumber}`);
      console.log(`🔐 Encrypted API Key: ${user.encryptedApiKey.substring(0, 50)}...`);
      console.log(`🔐 Encrypted API Secret: ${user.encryptedApiSecret.substring(0, 50)}...`);
      
      try {
        const apiKey = decrypt(user.encryptedApiKey);
        const apiSecret = decrypt(user.encryptedApiSecret);
        
        console.log(`✅ API Key decrypted successfully: ${apiKey.substring(0, 20)}...`);
        console.log(`✅ API Secret decrypted successfully: ${apiSecret.substring(0, 20)}...`);
        
        // Test if they look like Binance keys
        if (apiKey.length > 30 && apiSecret.length > 30) {
          console.log(`✅ Keys appear to have correct length`);
        } else {
          console.log(`❌ Keys appear too short (API Key: ${apiKey.length}, Secret: ${apiSecret.length})`);
        }
      } catch (decryptError) {
        console.log(`❌ Failed to decrypt keys: ${decryptError.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

debugApiKeys();
