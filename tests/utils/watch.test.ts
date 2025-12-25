import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearScreen,
  formatNow,
  startWatch,
  runWithWatch,
} from '../../src/utils/watch.js';

describe('Watch Utils', () => {
  describe('formatNow', () => {
    it('should return formatted date string', () => {
      const result = formatNow();
      // Should match format like "2025/01/15 08:30:00"
      expect(result).toMatch(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('clearScreen', () => {
    it('should write ANSI escape codes to stdout', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      clearScreen();

      expect(writeSpy).toHaveBeenCalledWith('\x1B[2J\x1B[0f');
      writeSpy.mockRestore();
    });
  });

  describe('startWatch', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should call callback immediately', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const stop = startWatch(callback, { interval: 10, showUpdateTime: false, clearScreen: false });

      await vi.advanceTimersByTimeAsync(0);

      expect(callback).toHaveBeenCalledTimes(1);
      stop();
    });

    it('should call callback at specified interval', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const stop = startWatch(callback, { interval: 5, showUpdateTime: false, clearScreen: false });

      await vi.advanceTimersByTimeAsync(0); // Initial call
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5000); // After 5 seconds
      expect(callback).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(5000); // After 10 seconds
      expect(callback).toHaveBeenCalledTimes(3);

      stop();
    });

    it('should stop when stop function is called', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const stop = startWatch(callback, { interval: 5, showUpdateTime: false, clearScreen: false });

      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      stop();

      await vi.advanceTimersByTimeAsync(10000);
      expect(callback).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should use default interval of 30 seconds', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const stop = startWatch(callback, { showUpdateTime: false, clearScreen: false });

      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(29000);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000); // 30 seconds total
      expect(callback).toHaveBeenCalledTimes(2);

      stop();
    });

    it('should handle callback errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const callback = vi.fn().mockRejectedValue(new Error('Test error'));
      const stop = startWatch(callback, { interval: 5, showUpdateTime: false, clearScreen: false });

      await vi.advanceTimersByTimeAsync(0);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test error'));

      // Should continue despite error
      await vi.advanceTimersByTimeAsync(5000);
      expect(callback).toHaveBeenCalledTimes(2);

      stop();
      consoleSpy.mockRestore();
    });
  });

  describe('runWithWatch', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should run callback once when watch is false', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      await runWithWatch(callback, false);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should start watch when watch is true', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      // Start in background (don't await as it never resolves in watch mode)
      const promise = runWithWatch(callback, true, {
        interval: 5,
        showUpdateTime: false,
        clearScreen: false
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5000);
      expect(callback).toHaveBeenCalledTimes(2);

      // Note: In real usage, watch mode would continue until SIGINT
    });
  });
});
