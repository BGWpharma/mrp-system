// src/services/ai/streaming/StreamingResponseHandler.js

/**
 * StreamingResponseHandler - obsługuje streaming odpowiedzi z GPT-5
 * Poprawia UX przez pokazywanie odpowiedzi w czasie rzeczywistym
 */
export class StreamingResponseHandler {
  
  /**
   * Przetwarza streaming odpowiedź z OpenAI API
   * @param {Function} apiCall - Funkcja zwracająca stream z OpenAI
   * @param {Function} onChunk - Callback dla każdego chunka (chunk, metadata)
   * @param {Function} onComplete - Callback po zakończeniu (fullResponse, metadata)
   * @param {Function} onError - Callback dla błędów
   * @returns {Promise<Object>} - Pełna odpowiedź
   */
  static async processStreamingResponse(apiCall, onChunk, onComplete, onError) {
    let fullResponse = '';
    let buffer = '';
    let chunkCount = 0;
    const startTime = performance.now();
    let firstChunkTime = null;

    try {
      const stream = await apiCall();
      
      for await (const chunk of stream) {
        chunkCount++;
        
        // Zanotuj czas pierwszego chunka (TTFB - Time To First Byte)
        if (!firstChunkTime) {
          firstChunkTime = performance.now() - startTime;
        }

        const content = chunk.choices[0]?.delta?.content || '';
        
        if (content) {
          buffer += content;
          fullResponse += content;
          
          // Wyślij chunk gdy mamy kompletne zdanie lub paragraf
          if (this.shouldFlushBuffer(buffer)) {
            const formatted = this.formatChunkForDisplay(buffer, fullResponse);
            onChunk(buffer, {
              chunkNumber: chunkCount,
              totalLength: fullResponse.length,
              formatting: formatted.formatting,
              progress: this.estimateProgress(fullResponse)
            });
            buffer = '';
          }
        }

        // Obsługa reasoning_tokens dla GPT-5
        if (chunk.choices[0]?.delta?.reasoning) {
          const reasoning = chunk.choices[0].delta.reasoning;
          onChunk('', {
            type: 'reasoning',
            reasoning: reasoning,
            chunkNumber: chunkCount
          });
        }
      }
      
      // Wyślij pozostałość bufora
      if (buffer.trim()) {
        const formatted = this.formatChunkForDisplay(buffer, fullResponse);
        onChunk(buffer, {
          chunkNumber: chunkCount,
          totalLength: fullResponse.length,
          formatting: formatted.formatting,
          isFinal: true
        });
      }
      
      const totalTime = performance.now() - startTime;
      
      const result = {
        success: true,
        response: fullResponse,
        streaming: true,
        metadata: {
          totalChunks: chunkCount,
          totalTime: totalTime,
          timeToFirstChunk: firstChunkTime,
          avgChunkTime: totalTime / chunkCount,
          responseLength: fullResponse.length,
          wordsPerSecond: this.calculateWPS(fullResponse, totalTime)
        }
      };
      
      onComplete(fullResponse, result.metadata);
      
      return result;
      
    } catch (error) {
      console.error('[StreamingResponseHandler] Error:', error);
      
      if (onError) {
        onError(error);
      }
      
      return {
        success: false,
        error: error.message,
        partialResponse: fullResponse,
        metadata: {
          totalChunks: chunkCount,
          errorAt: performance.now() - startTime
        }
      };
    }
  }

  /**
   * Określa czy należy wysłać chunk do UI
   */
  static shouldFlushBuffer(buffer) {
    // Wyślij gdy:
    // 1. Mamy kompletne zdanie (. ! ? z spacją po)
    if (/[.!?]\s+$/.test(buffer)) {
      return true;
    }
    
    // 2. Mamy nowy paragraf
    if (buffer.includes('\n\n')) {
      return true;
    }
    
    // 3. Mamy element listy
    if (/^\s*[-*•]\s.*\n/.test(buffer)) {
      return true;
    }
    
    // 4. Buffer jest za duży (>200 znaków)
    if (buffer.length > 200) {
      return true;
    }
    
    return false;
  }

  /**
   * Formatuje chunk dla wyświetlenia
   */
  static formatChunkForDisplay(chunk, previousContent) {
    // Wykryj kontekst formatowania
    const previousLines = previousContent.split('\n');
    const currentLines = chunk.split('\n');
    
    // Sprawdź czy jesteśmy w liście
    const inList = /^\s*[-*•]\s/.test(chunk) || 
                   previousLines[previousLines.length - 1]?.match(/^\s*[-*•]\s/);
    
    // Sprawdź czy jesteśmy w bloku kodu
    const codeBlockCount = (previousContent.match(/```/g) || []).length;
    const inCode = codeBlockCount % 2 === 1;
    
    // Sprawdź czy to nagłówek
    const isHeader = /^#{1,6}\s/.test(chunk);
    
    // Sprawdź czy to tabela
    const isTable = /\|.*\|/.test(chunk);
    
    // Sprawdź czy to bold/italic
    const hasBold = /\*\*.*\*\*/.test(chunk);
    const hasItalic = /\*[^*]+\*/.test(chunk);
    
    return {
      content: chunk,
      formatting: {
        inList,
        inCode,
        isHeader,
        isTable,
        hasBold,
        hasItalic,
        level: this.getHeaderLevel(chunk)
      }
    };
  }

  /**
   * Pobiera poziom nagłówka
   */
  static getHeaderLevel(text) {
    const match = text.match(/^(#{1,6})\s/);
    return match ? match[1].length : 0;
  }

  /**
   * Szacuje postęp na podstawie zawartości
   */
  static estimateProgress(content) {
    // Prosta heurystyka - zakładamy że odpowiedź ma ~500-2000 znaków
    const targetLength = 1000;
    const currentLength = content.length;
    
    const progress = Math.min((currentLength / targetLength) * 100, 95);
    
    return Math.round(progress);
  }

  /**
   * Oblicza słowa na sekundę
   */
  static calculateWPS(text, timeMs) {
    const words = text.split(/\s+/).length;
    const seconds = timeMs / 1000;
    return seconds > 0 ? (words / seconds).toFixed(1) : 0;
  }

  /**
   * Wrapper dla standardowego (non-streaming) API
   * Symuluje streaming dla spójnego interfejsu
   */
  static async processNonStreamingResponse(apiCall, onChunk, onComplete, onError) {
    const startTime = performance.now();
    
    try {
      const response = await apiCall();
      const content = response.choices[0]?.message?.content || '';
      
      // Symuluj streaming - wysyłaj po zdaniu
      const sentences = this.splitIntoSentences(content);
      
      let accumulated = '';
      for (let i = 0; i < sentences.length; i++) {
        accumulated += sentences[i];
        
        const formatted = this.formatChunkForDisplay(sentences[i], accumulated);
        onChunk(sentences[i], {
          chunkNumber: i + 1,
          totalLength: accumulated.length,
          formatting: formatted.formatting,
          progress: ((i + 1) / sentences.length) * 100,
          simulated: true
        });
        
        // Małe opóźnienie dla płynniejszego UX
        await this.delay(50);
      }
      
      const totalTime = performance.now() - startTime;
      
      const result = {
        success: true,
        response: content,
        streaming: false,
        simulated: true,
        metadata: {
          totalChunks: sentences.length,
          totalTime: totalTime,
          responseLength: content.length
        }
      };
      
      onComplete(content, result.metadata);
      
      return result;
      
    } catch (error) {
      console.error('[StreamingResponseHandler] Error in non-streaming:', error);
      
      if (onError) {
        onError(error);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Dzieli tekst na zdania
   */
  static splitIntoSentences(text) {
    // Prosty split po zdaniach (można ulepszyć)
    const sentences = [];
    let current = '';
    
    for (let i = 0; i < text.length; i++) {
      current += text[i];
      
      // Jeśli napotkamy koniec zdania
      if (['.', '!', '?'].includes(text[i]) && text[i + 1] === ' ') {
        current += ' ';
        sentences.push(current);
        current = '';
        i++; // Skip the space
      } else if (text[i] === '\n' && text[i + 1] === '\n') {
        current += '\n';
        sentences.push(current);
        current = '';
        i++; // Skip second newline
      }
    }
    
    // Dodaj pozostałość
    if (current) {
      sentences.push(current);
    }
    
    return sentences;
  }

  /**
   * Pomocnicza funkcja delay
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Konwertuje markdown stream do HTML w locie (opcjonalne)
   */
  static streamMarkdownToHtml(chunk, previousHtml = '') {
    // Prosta konwersja - można użyć biblioteki jak marked.js
    let html = chunk;
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Headers
    html = html.replace(/^(#{1,6})\s+(.*)$/gm, (match, hashes, content) => {
      const level = hashes.length;
      return `<h${level}>${content}</h${level}>`;
    });
    
    // Lista
    html = html.replace(/^\s*[-*•]\s+(.*)$/gm, '<li>$1</li>');
    
    // Paragraf
    if (chunk.includes('\n\n')) {
      html = html.replace(/\n\n/g, '</p><p>');
    }
    
    return html;
  }

  /**
   * Monitoruje wydajność streamingu
   */
  static createPerformanceMonitor() {
    const monitor = {
      chunks: [],
      startTime: null,
      firstChunkTime: null,
      
      recordChunk(chunkSize) {
        if (!this.startTime) {
          this.startTime = performance.now();
        }
        
        if (!this.firstChunkTime && chunkSize > 0) {
          this.firstChunkTime = performance.now() - this.startTime;
        }
        
        this.chunks.push({
          size: chunkSize,
          timestamp: performance.now() - this.startTime
        });
      },
      
      getStats() {
        if (this.chunks.length === 0) return null;
        
        const totalSize = this.chunks.reduce((sum, c) => sum + c.size, 0);
        const totalTime = this.chunks[this.chunks.length - 1].timestamp;
        
        return {
          totalChunks: this.chunks.length,
          totalSize: totalSize,
          totalTime: totalTime,
          firstChunkTime: this.firstChunkTime,
          avgChunkSize: totalSize / this.chunks.length,
          avgChunkInterval: totalTime / this.chunks.length,
          throughput: (totalSize / totalTime) * 1000 // bytes/sec
        };
      }
    };
    
    return monitor;
  }
}



