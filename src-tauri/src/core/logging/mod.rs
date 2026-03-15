// Core Logging Module
// Professional structured logging for production environments

use std::sync::Once;
use chrono::Utc;

static INIT: Once = Once::new();

/// Log level enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    fn as_str(&self) -> &'static str {
        match self {
            LogLevel::Trace => "TRACE",
            LogLevel::Debug => "DEBUG",
            LogLevel::Info => "INFO",
            LogLevel::Warn => "WARN",
            LogLevel::Error => "ERROR",
        }
    }
}

/// Initialize logging for the application
pub fn init_logging() {
    INIT.call_once(|| {
        #[cfg(debug_assertions)]
        {
            let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S%.3f UTC");
            eprintln!("[{}] [INFO] [app] FlowFolio starting in DEBUG mode", timestamp);
            eprintln!("[{}] [INFO] [app] Industrial-grade features enabled:", timestamp);
            eprintln!("[{}] [INFO] [app]   - Circuit breaker pattern", timestamp);
            eprintln!("[{}] [INFO] [app]   - Retry with exponential backoff", timestamp);
            eprintln!("[{}] [INFO] [app]   - Health monitoring and metrics", timestamp);
            eprintln!("[{}] [INFO] [app]   - Multi-tier caching", timestamp);
            eprintln!("[{}] [INFO] [app]   - Free-tier optimized providers", timestamp);
        }
    });
}

/// Log a structured message
pub fn log(level: LogLevel, module: &str, message: &str) {
    let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S%.3f UTC");
    eprintln!("[{}] [{}] [{}] {}", timestamp, level.as_str(), module, message);
}

/// Log with context data
pub fn log_with_context(level: LogLevel, module: &str, message: &str, context: &[(&str, &str)]) {
    let timestamp = Utc::now().format("%Y-%m-%d %H:%M:%S%.3f UTC");
    let ctx_str: String = context.iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(" ");
    
    if ctx_str.is_empty() {
        eprintln!("[{}] [{}] [{}] {}", timestamp, level.as_str(), module, message);
    } else {
        eprintln!("[{}] [{}] [{}] {} | {}", timestamp, level.as_str(), module, message, ctx_str);
    }
}

// Convenience macros for structured logging

#[macro_export]
macro_rules! log_trace {
    ($module:expr, $($arg:tt)*) => {
        #[cfg(debug_assertions)]
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Trace,
            $module,
            &format!($($arg)*)
        );
    };
}

#[macro_export]
macro_rules! log_debug {
    ($module:expr, $($arg:tt)*) => {
        #[cfg(debug_assertions)]
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Debug,
            $module,
            &format!($($arg)*)
        );
    };
}

#[macro_export]
macro_rules! log_info {
    ($module:expr, $($arg:tt)*) => {
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Info,
            $module,
            &format!($($arg)*)
        );
    };
}

#[macro_export]
macro_rules! log_warn {
    ($module:expr, $($arg:tt)*) => {
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Warn,
            $module,
            &format!($($arg)*)
        );
    };
}

#[macro_export]
macro_rules! log_error {
    ($module:expr, $($arg:tt)*) => {
        $crate::core::logging::log(
            $crate::core::logging::LogLevel::Error,
            $module,
            &format!($($arg)*)
        );
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_level_as_str() {
        assert_eq!(LogLevel::Trace.as_str(), "TRACE");
        assert_eq!(LogLevel::Debug.as_str(), "DEBUG");
        assert_eq!(LogLevel::Info.as_str(), "INFO");
        assert_eq!(LogLevel::Warn.as_str(), "WARN");
        assert_eq!(LogLevel::Error.as_str(), "ERROR");
    }

    #[test]
    fn test_init_logging_does_not_panic() {
        init_logging();
        init_logging(); // Second call is a no-op, should not panic
    }

    #[test]
    fn test_log_all_levels() {
        log(LogLevel::Trace, "test_module", "trace message");
        log(LogLevel::Debug, "test_module", "debug message");
        log(LogLevel::Info, "test_module", "info message");
        log(LogLevel::Warn, "test_module", "warn message");
        log(LogLevel::Error, "test_module", "error message");
    }

    #[test]
    fn test_log_with_context_empty() {
        log_with_context(LogLevel::Info, "test_module", "message with no context", &[]);
    }

    #[test]
    fn test_log_with_context_non_empty() {
        log_with_context(
            LogLevel::Warn,
            "test_module",
            "message with context",
            &[("key1", "value1"), ("key2", "value2")],
        );
    }
}
