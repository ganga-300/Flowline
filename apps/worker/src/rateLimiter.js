class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity;       // max tokens
    this.refillRate = refillRate;   // tokens per second
    this.tokens = capacity;         // shuru mein bucket bhara hua
    this.lastRefillTime = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillTime) / 1000;
    const tokensToAdd = Math.floor(elapsedSeconds * this.refillRate);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  async consume() {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Bucket khaali hai - ek token aane jitna wait karo, phir dobara try karo
    const waitTime = (1 / this.refillRate) * 1000; // milliseconds
    console.log(`[rateLimiter] bucket empty, waiting ${waitTime}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    return this.consume(); // recursion - jab tak token na mile, ye chalta rahega
  }
}

module.exports = TokenBucket;