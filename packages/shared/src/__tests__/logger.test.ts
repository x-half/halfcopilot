import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger, LogLevel, logger } from "../logger.js";

describe("Logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should create instance with default INFO level", () => {
    const log = new Logger();
    expect(log).toBeInstanceOf(Logger);
  });

  it("should respect log level and not log below threshold", () => {
    const log = new Logger(LogLevel.ERROR);
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    log.debug("debug msg");
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg");

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("[ERROR] error msg");
  });

  it("should log all levels when set to DEBUG", () => {
    const log = new Logger(LogLevel.DEBUG);
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    log.debug("test");
    log.info("test");
    log.warn("test");
    log.error("test");

    expect(debugSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("should update log level with setLevel", () => {
    const log = new Logger(LogLevel.SILENT);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    log.info("should not log");
    expect(infoSpy).not.toHaveBeenCalled();

    log.setLevel(LogLevel.INFO);
    log.info("should log now");
    expect(infoSpy).toHaveBeenCalledWith("[INFO] should log now");
  });

  it("should be a singleton via exported logger instance", () => {
    expect(logger).toBeInstanceOf(Logger);
  });

  it("should pass extra args to console methods", () => {
    const log = new Logger(LogLevel.INFO);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    log.info("msg", { key: "val" }, 42);
    expect(infoSpy).toHaveBeenCalledWith("[INFO] msg", { key: "val" }, 42);
  });
});
