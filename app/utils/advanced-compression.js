import { compress as lzCompress, decompress as lzDecompress } from 'lz-string';

/**
 * Advanced Compression Utilities
 * Provides multiple compression algorithms and adaptive compression strategies
 */

export const COMPRESSION_ALGORITHMS = {
  LZ_STRING: 'lz-string',
  LZ_STRING_UTF16: 'lz-string-utf16',
  LZ_STRING_BASE64: 'lz-string-base64',
  BROTLI: 'brotli', // Future: when available in browsers
  GZIP: 'gzip', // Future: when available in browsers
  NONE: 'none',
};

export const COMPRESSION_LEVELS = {
  NONE: 0,
  FAST: 1,
  BALANCED: 5,
  MAXIMUM: 9,
};

/**
 * Compression statistics and metrics
 */
class CompressionStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalOperations = 0;
    this.totalOriginalSize = 0;
    this.totalCompressedSize = 0;
    this.totalCompressionTime = 0;
    this.totalDecompressionTime = 0;
    this.algorithmUsage = {};
    this.compressionRatios = [];
  }

  addOperation(operation) {
    this.totalOperations++;
    this.totalOriginalSize += operation.originalSize;
    this.totalCompressedSize += operation.compressedSize;
    this.totalCompressionTime += operation.compressionTime;
    this.totalDecompressionTime += operation.decompressionTime || 0;

    if (!this.algorithmUsage[operation.algorithm]) {
      this.algorithmUsage[operation.algorithm] = 0;
    }
    this.algorithmUsage[operation.algorithm]++;

    this.compressionRatios.push(operation.compressionRatio);
  }

  getStats() {
    const avgCompressionRatio =
      this.compressionRatios.length > 0
        ? this.compressionRatios.reduce((a, b) => a + b, 0) /
          this.compressionRatios.length
        : 0;

    return {
      totalOperations: this.totalOperations,
      totalOriginalSize: this.totalOriginalSize,
      totalCompressedSize: this.totalCompressedSize,
      totalSaved: this.totalOriginalSize - this.totalCompressedSize,
      averageCompressionRatio: avgCompressionRatio,
      averageCompressionTime:
        this.totalCompressionTime / this.totalOperations || 0,
      averageDecompressionTime:
        this.totalDecompressionTime / this.totalOperations || 0,
      algorithmUsage: this.algorithmUsage,
      spaceSavingsPercent:
        this.totalOriginalSize > 0
          ? ((this.totalOriginalSize - this.totalCompressedSize) /
              this.totalOriginalSize) *
            100
          : 0,
    };
  }
}

// Global compression statistics
export const compressionStats = new CompressionStats();

/**
 * Advanced compression configuration
 */
export class CompressionConfig {
  constructor(options = {}) {
    this.algorithm = options.algorithm || COMPRESSION_ALGORITHMS.LZ_STRING;
    this.level = options.level || COMPRESSION_LEVELS.BALANCED;
    this.minSize = options.minSize || 100; // Don't compress data smaller than 100 bytes
    this.maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB max
    this.adaptiveThreshold = options.adaptiveThreshold || 0.8; // Switch algorithm if ratio < 80%
    this.enableAdaptive = options.enableAdaptive !== false;
    this.enableStats = options.enableStats !== false;
    this.chunkSize = options.chunkSize || 64 * 1024; // 64KB chunks for large data
    this.parallelProcessing =
      options.parallelProcessing && typeof Worker !== 'undefined';
  }
}

/**
 * Advanced compression with multiple algorithms and adaptive selection
 */
export async function compressAdvanced(data, config = new CompressionConfig()) {
  const startTime = performance.now();

  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }

  const originalSize = new Blob([data]).size;

  // Skip compression for small data
  if (originalSize < config.minSize) {
    return {
      algorithm: COMPRESSION_ALGORITHMS.NONE,
      data: data,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1.0,
      compressionTime: 0,
      metadata: { skipped: 'too_small' },
    };
  }

  // Skip compression for very large data
  if (originalSize > config.maxSize) {
    console.warn(`Data too large for compression: ${originalSize} bytes`);
    return {
      algorithm: COMPRESSION_ALGORITHMS.NONE,
      data: data,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1.0,
      compressionTime: 0,
      metadata: { skipped: 'too_large' },
    };
  }

  let bestResult = null;
  let algorithms = [config.algorithm];

  // For adaptive compression, try multiple algorithms
  if (config.enableAdaptive) {
    algorithms = [
      COMPRESSION_ALGORITHMS.LZ_STRING,
      COMPRESSION_ALGORITHMS.LZ_STRING_UTF16,
      COMPRESSION_ALGORITHMS.LZ_STRING_BASE64,
    ];
  }

  // Try compression with different algorithms
  for (const algorithm of algorithms) {
    try {
      const result = await compressWithAlgorithm(data, algorithm, config);

      if (
        !bestResult ||
        result.compressionRatio < bestResult.compressionRatio
      ) {
        bestResult = result;
      }

      // If we get good compression, we can stop early (unless we want the best)
      if (
        !config.enableAdaptive &&
        result.compressionRatio < config.adaptiveThreshold
      ) {
        break;
      }
    } catch (error) {
      console.warn(`Compression failed with ${algorithm}:`, error);
    }
  }

  if (!bestResult) {
    // Fallback to no compression
    bestResult = {
      algorithm: COMPRESSION_ALGORITHMS.NONE,
      data: data,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1.0,
      compressionTime: 0,
      metadata: { error: 'all_algorithms_failed' },
    };
  }

  bestResult.compressionTime = performance.now() - startTime;

  // Update statistics
  if (config.enableStats) {
    compressionStats.addOperation(bestResult);
  }

  return bestResult;
}

/**
 * Compress data with a specific algorithm
 */
async function compressWithAlgorithm(data, algorithm, config) {
  const originalSize = new Blob([data]).size;
  let compressedData;
  let metadata = {};

  switch (algorithm) {
    case COMPRESSION_ALGORITHMS.LZ_STRING:
      compressedData = lzCompress(data);
      break;

    case COMPRESSION_ALGORITHMS.LZ_STRING_UTF16:
      compressedData = lzStringCompressUTF16(data);
      break;

    case COMPRESSION_ALGORITHMS.LZ_STRING_BASE64:
      compressedData = lzStringCompressBase64(data);
      break;

    case COMPRESSION_ALGORITHMS.NONE:
      compressedData = data;
      break;

    default:
      throw new Error(`Unsupported compression algorithm: ${algorithm}`);
  }

  const compressedSize = new Blob([compressedData]).size;
  const compressionRatio = compressedSize / originalSize;

  return {
    algorithm,
    data: compressedData,
    originalSize,
    compressedSize,
    compressionRatio,
    metadata,
  };
}

/**
 * Decompress data with automatic algorithm detection
 */
export async function decompressAdvanced(compressedResult) {
  const startTime = performance.now();

  if (!compressedResult || typeof compressedResult !== 'object') {
    throw new Error('Invalid compressed data format');
  }

  const { algorithm, data } = compressedResult;

  if (algorithm === COMPRESSION_ALGORITHMS.NONE) {
    return {
      data,
      decompressionTime: 0,
    };
  }

  let decompressedData;

  try {
    switch (algorithm) {
      case COMPRESSION_ALGORITHMS.LZ_STRING:
        decompressedData = lzDecompress(data);
        break;

      case COMPRESSION_ALGORITHMS.LZ_STRING_UTF16:
        decompressedData = lzStringDecompressUTF16(data);
        break;

      case COMPRESSION_ALGORITHMS.LZ_STRING_BASE64:
        decompressedData = lzStringDecompressBase64(data);
        break;

      default:
        throw new Error(`Unsupported decompression algorithm: ${algorithm}`);
    }

    if (decompressedData === null) {
      throw new Error('Decompression returned null - data may be corrupted');
    }
  } catch (error) {
    throw new Error(`Decompression failed: ${error.message}`);
  }

  const decompressionTime = performance.now() - startTime;

  return {
    data: decompressedData,
    decompressionTime,
  };
}

/**
 * Chunk-based compression for large datasets
 */
export async function compressChunked(data, config = new CompressionConfig()) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }

  const originalSize = data.length;

  if (originalSize <= config.chunkSize) {
    return await compressAdvanced(data, config);
  }

  const chunks = [];
  const chunkMetadata = [];

  // Split data into chunks
  for (let i = 0; i < data.length; i += config.chunkSize) {
    const chunk = data.slice(i, i + config.chunkSize);
    const compressedChunk = await compressAdvanced(chunk, config);

    chunks.push(compressedChunk.data);
    chunkMetadata.push({
      originalSize: chunk.length,
      compressedSize: compressedChunk.compressedSize,
      algorithm: compressedChunk.algorithm,
      compressionRatio: compressedChunk.compressionRatio,
    });
  }

  const totalCompressedSize = chunkMetadata.reduce(
    (sum, meta) => sum + meta.compressedSize,
    0,
  );
  const averageCompressionRatio = totalCompressedSize / originalSize;

  return {
    algorithm: 'chunked',
    data: chunks,
    metadata: {
      chunks: chunkMetadata,
      chunkSize: config.chunkSize,
      totalChunks: chunks.length,
    },
    originalSize,
    compressedSize: totalCompressedSize,
    compressionRatio: averageCompressionRatio,
  };
}

/**
 * Decompress chunked data
 */
export async function decompressChunked(compressedResult) {
  if (compressedResult.algorithm !== 'chunked') {
    return await decompressAdvanced(compressedResult);
  }

  const { data: chunks, metadata } = compressedResult;
  const decompressedChunks = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkData = chunks[i];
    const chunkMeta = metadata.chunks[i];

    const chunkResult = {
      algorithm: chunkMeta.algorithm,
      data: chunkData,
      originalSize: chunkMeta.originalSize,
      compressedSize: chunkMeta.compressedSize,
      compressionRatio: chunkMeta.compressionRatio,
    };

    const decompressed = await decompressAdvanced(chunkResult);
    decompressedChunks.push(decompressed.data);
  }

  return {
    data: decompressedChunks.join(''),
    decompressionTime: 0, // TODO: track individual chunk times
  };
}

/**
 * Streaming compression for real-time data
 */
export class StreamingCompressor {
  constructor(config = new CompressionConfig()) {
    this.config = config;
    this.buffer = '';
    this.compressedChunks = [];
    this.stats = {
      totalOriginal: 0,
      totalCompressed: 0,
      chunks: 0,
    };
  }

  async addData(data) {
    if (typeof data !== 'string') {
      data = JSON.stringify(data);
    }

    this.buffer += data;

    // Compress when buffer reaches chunk size
    if (this.buffer.length >= this.config.chunkSize) {
      await this.flushBuffer();
    }
  }

  async flushBuffer() {
    if (this.buffer.length === 0) return;

    const compressed = await compressAdvanced(this.buffer, this.config);
    this.compressedChunks.push(compressed);

    this.stats.totalOriginal += this.buffer.length;
    this.stats.totalCompressed += compressed.compressedSize;
    this.stats.chunks++;

    this.buffer = '';
  }

  async finalize() {
    await this.flushBuffer();

    return {
      algorithm: 'streaming',
      data: this.compressedChunks,
      originalSize: this.stats.totalOriginal,
      compressedSize: this.stats.totalCompressed,
      compressionRatio: this.stats.totalCompressed / this.stats.totalOriginal,
      metadata: {
        chunks: this.stats.chunks,
        chunkSize: this.config.chunkSize,
      },
    };
  }
}

/**
 * Compression performance benchmark
 */
export async function benchmarkCompression(testData, iterations = 10) {
  const algorithms = Object.values(COMPRESSION_ALGORITHMS).filter(
    (alg) => alg !== COMPRESSION_ALGORITHMS.NONE,
  );
  const results = {};

  for (const algorithm of algorithms) {
    const config = new CompressionConfig({ algorithm, enableStats: false });
    const times = [];
    let totalRatio = 0;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = await compressAdvanced(testData, config);
      const end = performance.now();

      times.push(end - start);
      totalRatio += result.compressionRatio;
    }

    results[algorithm] = {
      averageTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      averageCompressionRatio: totalRatio / iterations,
      operations: iterations,
    };
  }

  return results;
}

// Helper functions for LZ-String variants
function lzStringCompressUTF16(data) {
  // LZ-String UTF16 implementation
  return lzCompress(data); // Simplified for now
}

function lzStringDecompressUTF16(data) {
  return lzDecompress(data);
}

function lzStringCompressBase64(data) {
  // LZ-String Base64 implementation
  return btoa(lzCompress(data) || '');
}

function lzStringDecompressBase64(data) {
  try {
    return lzDecompress(atob(data));
  } catch (error) {
    throw new Error('Invalid base64 compressed data');
  }
}

/**
 * Automatic compression strategy selector
 */
export function getOptimalCompressionConfig(dataProfile) {
  const { size, type, frequency, priority } = dataProfile;

  let config = new CompressionConfig();

  // Adjust based on data size
  if (size < 1024) {
    // < 1KB
    config.algorithm = COMPRESSION_ALGORITHMS.NONE;
    config.minSize = Infinity; // Skip compression
  } else if (size < 10 * 1024) {
    // < 10KB
    config.algorithm = COMPRESSION_ALGORITHMS.LZ_STRING;
    config.level = COMPRESSION_LEVELS.FAST;
  } else if (size < 100 * 1024) {
    // < 100KB
    config.algorithm = COMPRESSION_ALGORITHMS.LZ_STRING_UTF16;
    config.level = COMPRESSION_LEVELS.BALANCED;
  } else {
    config.enableAdaptive = true;
    config.level = COMPRESSION_LEVELS.MAXIMUM;
  }

  // Adjust based on data type
  if (type === 'delta' || type === 'json') {
    config.enableAdaptive = true;
  }

  // Adjust based on frequency
  if (frequency === 'high') {
    config.level = COMPRESSION_LEVELS.FAST;
    config.enableAdaptive = false;
  }

  // Adjust based on priority
  if (priority === 'realtime') {
    config.algorithm = COMPRESSION_ALGORITHMS.LZ_STRING;
    config.level = COMPRESSION_LEVELS.FAST;
    config.enableAdaptive = false;
  } else if (priority === 'storage') {
    config.enableAdaptive = true;
    config.level = COMPRESSION_LEVELS.MAXIMUM;
  }

  return config;
}

/**
 * Reset global compression statistics
 */
export function resetCompressionStats() {
  compressionStats.reset();
}

/**
 * Get current compression statistics
 */
export function getCompressionStats() {
  return compressionStats.getStats();
}
