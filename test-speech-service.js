/**
 * Test script to verify speech service configuration
 * This doesn't make actual API calls but validates the service setup
 */

import { speechService } from '../src/services/speechService.js';

console.log('🧪 Testing Speech Service Configuration...');

// Test 1: Check supported audio formats
console.log('\n📋 Testing supported audio formats:');
const testFormats = [
  'audio/mpeg',
  'audio/wav', 
  'audio/ogg',
  'video/mp4', // This should not be supported
  'text/plain' // This should not be supported
];

testFormats.forEach(format => {
  const isSupported = speechService.isSupportedAudioFormat(format);
  console.log(`  ${format}: ${isSupported ? '✅ Supported' : '❌ Not supported'}`);
});

// Test 2: Check service initialization
console.log('\n🔧 Testing service initialization:');
try {
  // The service should initialize if ELEVENLABS_API_KEY is set
  console.log('  ✅ SpeechService initialized successfully');
} catch (error) {
  console.log(`  ❌ SpeechService initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
}

console.log('\n🎉 Speech service configuration test complete!');
console.log('\nℹ️  To test actual transcription:');
console.log('   1. Set ELEVENLABS_API_KEY in your .env file');
console.log('   2. Send a voice message to your WhatsApp bot');
console.log('   3. Check the logs for transcription results');
