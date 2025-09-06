import { config } from "../config.js";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

class SpeechService {
  private client: ElevenLabsClient;

  constructor() {
    if (!config.elevenlabs?.apiKey) {
      throw new Error(
        "ElevenLabs API key is required. Please set ELEVENLABS_API_KEY in your environment variables."
      );
    }
    this.client = new ElevenLabsClient({
      apiKey: config.elevenlabs.apiKey,
    });
  }

  /**
   * Convert speech to text using ElevenLabs Speech-to-Text API
   * @param audioBuffer - Audio file buffer
   * @param mimeType - MIME type of the audio file
   * @returns Promise<string> - Transcribed text
   */
  async speechToText(audioBuffer: Buffer, mimeType: string): Promise<string> {
    try {
      console.log("🎤 Starting speech-to-text conversion...");
      console.log(`📄 Audio buffer size: ${audioBuffer.length} bytes`);
      console.log(`🎵 Audio MIME type: ${mimeType}`);

      if (!this.isSupportedAudioFormat(mimeType)) {
        throw new Error(`Unsupported audio format: ${mimeType}`);
      }

      // Convert buffer to Uint8Array for blob creation
      const uint8Array = new Uint8Array(audioBuffer);
      const audioBlob = new Blob([uint8Array], { type: mimeType });

      console.log(`🔄 Sending audio to ElevenLabs API...`);

      // Use the correct ElevenLabs client API
      const transcription = await this.client.speechToText.convert({
        file: audioBlob,
        modelId: "scribe_v1", // Currently only scribe_v1 is supported
        // Set to English, can be changed or set to null for auto-detection
      });

      console.log(
        "🔍 Transcription response structure:",
        JSON.stringify(transcription, null, 2)
      );

      // Extract text from the transcription response
      let transcribedText = "";

      if (transcription && typeof transcription === "object") {
        // Handle different response structures
        if ("text" in transcription) {
          transcribedText = String(transcription.text || "");
        } else if ("transcription" in transcription) {
          transcribedText = String((transcription as any).transcription || "");
        } else if (
          "channels" in transcription &&
          Array.isArray((transcription as any).channels)
        ) {
          // Handle multichannel response
          const channels = (transcription as any).channels;
          if (channels.length > 0 && channels[0].segments) {
            transcribedText = channels[0].segments
              .map((segment: any) => segment.text || "")
              .join(" ");
          }
        }
      }

      console.log("✅ Speech-to-text conversion completed");
      console.log(`📝 Transcribed text: "${transcribedText}"`);

      return transcribedText.trim();
    } catch (error) {
      console.error("❌ Error in speech-to-text conversion:", error);
      throw new Error(
        `Speech-to-text conversion failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get file extension based on MIME type
   * @param mimeType - MIME type of the audio file
   * @returns File extension
   */
  private getFileExtension(mimeType: string): string {
    const mimeToExtension: { [key: string]: string } = {
      "audio/mpeg": "mp3",
      "audio/mp3": "mp3",
      "audio/wav": "wav",
      "audio/wave": "wav",
      "audio/x-wav": "wav",
      "audio/ogg": "ogg",
      "audio/webm": "webm",
      "audio/mp4": "mp4",
      "audio/m4a": "m4a",
      "audio/aac": "aac",
      "audio/flac": "flac",
    };

    return mimeToExtension[mimeType.toLowerCase()] || "mp3";
  }

  /**
   * Validate if the audio format is supported
   * @param mimeType - MIME type to validate
   * @returns boolean - Whether the format is supported
   */
  isSupportedAudioFormat(mimeType: string): boolean {
    const supportedFormats = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/ogg",
      "audio/webm",
      "audio/mp4",
      "audio/m4a",
      "audio/aac",
      "audio/flac",
    ];

    return supportedFormats.includes(mimeType.toLowerCase());
  }
}

export const speechService = new SpeechService();
