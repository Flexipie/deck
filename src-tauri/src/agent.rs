use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use tauri_plugin_shell::ShellExt;
use tokio::time::timeout;

const CLAUDE_TIMEOUT_SECS: u64 = 120;
const CLAUDE_BIN_ENV: &str = "PHASE2_CLAUDE_BIN";
const DEFAULT_CLAUDE_BIN: &str = "claude";

#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error("agent spawn failed: {0}")]
    Spawn(String),
    #[error("agent timeout after {0}s")]
    Timeout(u64),
    #[error("invalid stdout utf-8")]
    InvalidUtf8,
    #[error("envelope parse failed: {0}")]
    Parse(String),
}

impl Serialize for AgentError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct AgentResponse {
    pub ok: bool,
    pub result: Option<String>,
    pub session_id: Option<String>,
    pub duration_ms: Option<u64>,
    pub total_cost_usd: Option<f64>,
    pub error: Option<String>,
    pub raw: String,
}

/// Parse Claude Code's `--output-format json` envelope.
///
/// Shape (per Claude Code docs):
///   { "type": "result", "subtype": "success" | "error_*",
///     "is_error": bool, "result": "<text>",
///     "session_id": "<uuid>", "duration_ms": int,
///     "total_cost_usd": float, ... }
pub fn parse_envelope(stdout: &str) -> Result<AgentResponse, AgentError> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Err(AgentError::Parse("empty stdout".into()));
    }
    let v: Value = serde_json::from_str(trimmed)
        .map_err(|e| AgentError::Parse(format!("invalid json: {e}")))?;

    let is_error = v.get("is_error").and_then(|x| x.as_bool()).unwrap_or(false);
    let result = v
        .get("result")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let session_id = v
        .get("session_id")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let duration_ms = v.get("duration_ms").and_then(|x| x.as_u64());
    let total_cost_usd = v.get("total_cost_usd").and_then(|x| x.as_f64());
    let error = if is_error {
        Some(
            v.get("error")
                .and_then(|x| x.as_str())
                .or_else(|| v.get("subtype").and_then(|x| x.as_str()))
                .unwrap_or("unknown agent error")
                .to_string(),
        )
    } else {
        None
    };

    Ok(AgentResponse {
        ok: !is_error,
        result,
        session_id,
        duration_ms,
        total_cost_usd,
        error,
        raw: stdout.to_string(),
    })
}

fn claude_bin() -> String {
    std::env::var(CLAUDE_BIN_ENV).unwrap_or_else(|_| DEFAULT_CLAUDE_BIN.to_string())
}

#[tauri::command]
pub async fn run_claude(
    app: tauri::AppHandle,
    prompt: String,
    json_schema: Option<serde_json::Value>,
    resume_session: Option<String>,
    cwd: Option<String>,
) -> Result<AgentResponse, AgentError> {
    let mut args: Vec<String> = vec![
        "-p".into(),
        prompt,
        "--output-format".into(),
        "json".into(),
    ];
    if let Some(schema) = json_schema {
        args.push("--json-schema".into());
        args.push(
            serde_json::to_string(&schema)
                .map_err(|e| AgentError::Spawn(format!("serialize schema: {e}")))?,
        );
    }
    if let Some(id) = resume_session {
        args.push("--resume".into());
        args.push(id);
    }

    let bin = claude_bin();
    let mut cmd = app.shell().command(&bin).args(args);
    if let Some(dir) = cwd {
        cmd = cmd.current_dir(dir);
    }

    let fut = cmd.output();
    let output = timeout(Duration::from_secs(CLAUDE_TIMEOUT_SECS), fut)
        .await
        .map_err(|_| AgentError::Timeout(CLAUDE_TIMEOUT_SECS))?
        .map_err(|e| AgentError::Spawn(e.to_string()))?;

    let stdout = String::from_utf8(output.stdout).map_err(|_| AgentError::InvalidUtf8)?;

    if !output.status.success() && stdout.trim().is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Ok(AgentResponse {
            ok: false,
            result: None,
            session_id: None,
            duration_ms: None,
            total_cost_usd: None,
            error: Some(if stderr.is_empty() {
                format!("{} exited with status {:?}", bin, output.status.code())
            } else {
                stderr.clone()
            }),
            raw: stderr,
        });
    }

    parse_envelope(&stdout)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_success_envelope() {
        let raw = r#"{
          "type": "result",
          "subtype": "success",
          "is_error": false,
          "result": "{\"greeting\":\"hi\"}",
          "session_id": "abc-123",
          "duration_ms": 1234,
          "total_cost_usd": 0.0021
        }"#;
        let r = parse_envelope(raw).unwrap();
        assert!(r.ok);
        assert_eq!(r.result.as_deref(), Some("{\"greeting\":\"hi\"}"));
        assert_eq!(r.session_id.as_deref(), Some("abc-123"));
        assert_eq!(r.duration_ms, Some(1234));
        assert_eq!(r.total_cost_usd, Some(0.0021));
        assert!(r.error.is_none());
    }

    #[test]
    fn parses_error_envelope() {
        let raw = r#"{
          "type": "result",
          "subtype": "error_max_turns",
          "is_error": true,
          "session_id": "xyz",
          "error": "too many turns"
        }"#;
        let r = parse_envelope(raw).unwrap();
        assert!(!r.ok);
        assert_eq!(r.error.as_deref(), Some("too many turns"));
        assert_eq!(r.session_id.as_deref(), Some("xyz"));
    }

    #[test]
    fn rejects_empty_stdout() {
        let err = parse_envelope("").unwrap_err();
        match err {
            AgentError::Parse(_) => {}
            other => panic!("expected Parse, got {:?}", other),
        }
    }

    #[test]
    fn rejects_malformed_json() {
        let err = parse_envelope("not json at all").unwrap_err();
        match err {
            AgentError::Parse(_) => {}
            other => panic!("expected Parse, got {:?}", other),
        }
    }

    #[test]
    fn missing_optional_fields_are_none() {
        let raw = r#"{"is_error": false, "result": "ok"}"#;
        let r = parse_envelope(raw).unwrap();
        assert!(r.ok);
        assert_eq!(r.result.as_deref(), Some("ok"));
        assert!(r.session_id.is_none());
        assert!(r.duration_ms.is_none());
        assert!(r.total_cost_usd.is_none());
    }

    #[test]
    fn error_envelope_without_explicit_error_falls_back_to_subtype() {
        let raw = r#"{"is_error": true, "subtype": "error_during_execution"}"#;
        let r = parse_envelope(raw).unwrap();
        assert!(!r.ok);
        assert_eq!(r.error.as_deref(), Some("error_during_execution"));
    }
}
