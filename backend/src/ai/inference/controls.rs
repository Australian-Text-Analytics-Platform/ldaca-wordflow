//! Provider-native controls. Unknown models deliberately expose only provider defaults.
use super::*;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingKind {
    ReasoningEffort,
    ThinkingBudget,
    ThinkingLevel,
    BudgetTokens,
    AdaptiveEffort,
    Disabled,
    OpenrouterEffort,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(
    tag = "control",
    content = "value",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Thinking {
    ReasoningEffort(String),
    ThinkingBudget(i32),
    ThinkingLevel(String),
    BudgetTokens(i32),
    AdaptiveEffort(String),
    Disabled,
    OpenrouterEffort(String),
}
#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct InferenceCapabilities {
    pub thinking: Vec<ThinkingKind>,
    pub efforts: Vec<String>,
    pub budget_min: i32,
    pub budget_max: i32,
    pub temperature_with_thinking: bool,
    pub max_concurrency: usize,
    pub default_concurrency: usize,
}
fn family(model: &str, name: &str) -> bool {
    model == name
        || model
            .strip_prefix(name)
            .and_then(|s| s.strip_prefix('-'))
            .is_some_and(|s| {
                let date = s.replace('-', "");
                date.len() == 8
                    && date.starts_with("20")
                    && date.chars().all(|c| c.is_ascii_digit())
            })
}
pub fn capabilities(provider: Provider, model: &str) -> InferenceCapabilities {
    use ThinkingKind::*;
    let model = model.trim().strip_prefix("models/").unwrap_or(model.trim());
    let mut result = InferenceCapabilities {
        thinking: vec![],
        efforts: vec![],
        budget_min: 0,
        budget_max: 0,
        temperature_with_thinking: true,
        max_concurrency: if provider == Provider::Apple { 1 } else { 32 },
        default_concurrency: match provider {
            Provider::Apple => 1,
            Provider::Custom => 2,
            _ => 10,
        },
    };
    let mut efforts: &[&str] = &[];
    match provider {
        Provider::Openai | Provider::Custom => {
            if ["gpt-5.2", "gpt-5.4"]
                .iter()
                .any(|name| family(model, name))
            {
                efforts = &["none", "low", "medium", "high", "xhigh"];
            } else if family(model, "gpt-5.1") {
                efforts = &["none", "low", "medium", "high"];
            } else if ["gpt-5", "gpt-5-mini", "gpt-5-nano"]
                .iter()
                .any(|name| family(model, name))
            {
                efforts = &["minimal", "low", "medium", "high"];
            } else if ["o3", "o4-mini"].iter().any(|name| family(model, name)) {
                efforts = &["low", "medium", "high"];
            } else if ["gpt-6-astra", "gpt-6.1-sol", "gpt-5.5"]
                .iter()
                .any(|name| family(model, name))
            {
                efforts = &["low", "medium", "high", "xhigh"];
            }
            if !efforts.is_empty() {
                result.thinking.push(ReasoningEffort);
                result.temperature_with_thinking = false;
            }
        }
        Provider::Google => {
            if [
                "gemini-2.5-pro",
                "gemini-2.5-flash",
                "gemini-2.5-flash-lite",
            ]
            .iter()
            .any(|name| family(model, name))
            {
                result.thinking.push(ThinkingBudget);
                result.budget_min = if model.starts_with("gemini-2.5-pro") {
                    128
                } else if model.starts_with("gemini-2.5-flash-lite") {
                    512
                } else {
                    0
                };
                result.budget_max = if model.starts_with("gemini-2.5-pro") {
                    32768
                } else {
                    24576
                };
            } else {
                efforts = match model {
                    "gemini-3-pro-preview" => &["low", "high"],
                    "gemini-3.1-pro-preview" | "gemini-3.8-flash" | "gemini-4-argon" => {
                        &["low", "medium", "high"]
                    }
                    "gemini-3-flash-preview" | "gemini-3.5-flash-lite" | "gemini-3.6-flash" => {
                        &["minimal", "low", "medium", "high"]
                    }
                    _ => &[],
                };
                if !efforts.is_empty() {
                    result.thinking.push(ThinkingLevel);
                }
            }
        }
        Provider::Anthropic => {
            if ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-5"]
                .iter()
                .any(|name| family(model, name))
            {
                result.thinking.extend([BudgetTokens, Disabled]);
                result.budget_min = 1024;
                result.budget_max = 65536 - 4096;
            } else if [
                "claude-sonnet-4-6",
                "claude-opus-4-6",
                "claude-opus-4-7",
                "claude-opus-4-8",
                "claude-opus-5",
                "claude-opus-5-5",
                "claude-sonnet-5",
                "claude-sonnet-5-5",
                "claude-haiku-5-5",
            ]
            .iter()
            .any(|name| family(model, name))
            {
                result.thinking.push(AdaptiveEffort);
                if ["claude-sonnet-4-6", "claude-opus-4-6"]
                    .iter()
                    .any(|name| family(model, name))
                {
                    result.thinking.push(Disabled);
                }
                efforts = if ["claude-sonnet-4-6", "claude-opus-4-6"]
                    .iter()
                    .any(|name| family(model, name))
                {
                    &["low", "medium", "high", "max"]
                } else {
                    &["low", "medium", "high", "xhigh", "max"]
                };
            }
            result.temperature_with_thinking = result.thinking.is_empty();
        }
        Provider::Openrouter => {
            // Recognised model IDs only; a router or unknown model keeps provider defaults.
            if let Some((vendor, name)) = model.split_once('/') {
                let underlying = match vendor {
                    "openai" => Some(Provider::Openai),
                    "google" => Some(Provider::Google),
                    "anthropic" => Some(Provider::Anthropic),
                    _ => None,
                };
                if let Some(underlying) = underlying {
                    let normalized = if underlying == Provider::Anthropic {
                        name.replace('.', "-")
                    } else {
                        name.into()
                    };
                    let known = capabilities(underlying, &normalized);
                    if !known.efforts.is_empty() {
                        result.thinking.push(OpenrouterEffort);
                        result.efforts = known.efforts;
                    }
                }
            }
        }
        Provider::Apple => {}
    }
    result.efforts.extend(efforts.iter().map(|s| (*s).into()));
    result
}
pub(super) fn thinking_budget(provider: Provider, config: &Inference) -> Result<i32> {
    if config.reasoning != Reasoning::Default {
        return Err(Error::invalid(
            "The saved shared reasoning scale is retired. Choose a provider-native thinking control or Provider default.",
        ));
    }
    let Some(thinking) = &config.thinking else {
        return Ok(0);
    };
    let controls = capabilities(provider, &config.model);
    let (kind, effort, budget) = match thinking {
        Thinking::ReasoningEffort(s) => (ThinkingKind::ReasoningEffort, Some(s), 0),
        Thinking::ThinkingLevel(s) => (ThinkingKind::ThinkingLevel, Some(s), 0),
        Thinking::AdaptiveEffort(s) => (ThinkingKind::AdaptiveEffort, Some(s), 0),
        Thinking::OpenrouterEffort(s) => (ThinkingKind::OpenrouterEffort, Some(s), 0),
        Thinking::ThinkingBudget(n) => (ThinkingKind::ThinkingBudget, None, *n),
        Thinking::BudgetTokens(n) => (ThinkingKind::BudgetTokens, None, *n),
        Thinking::Disabled => (ThinkingKind::Disabled, None, 0),
    };
    if !controls.thinking.contains(&kind) || effort.is_some_and(|s| !controls.efforts.contains(s)) {
        return Err(Error::invalid(
            "This thinking control is not supported for the selected model; choose Provider default",
        ));
    }
    if matches!(
        kind,
        ThinkingKind::ThinkingBudget | ThinkingKind::BudgetTokens
    ) && !(controls.budget_min..=controls.budget_max).contains(&budget)
        && !(kind == ThinkingKind::ThinkingBudget
            && (budget == -1 || (budget == 0 && !config.model.contains("pro"))))
    {
        return Err(Error::invalid(
            "Thinking token budget is outside this model's supported range",
        ));
    }
    let enabled = match thinking {
        Thinking::Disabled => false,
        Thinking::ReasoningEffort(s) if s == "none" => false,
        _ => true,
    };
    if enabled && config.temperature.is_some() && !controls.temperature_with_thinking {
        return Err(Error::invalid(
            "Choose Provider default temperature with this thinking control",
        ));
    }
    Ok(budget.max(0))
}
pub(super) fn apply_thinking(body: &mut Value, thinking: &Option<Thinking>) {
    match thinking {
        None => {}
        Some(Thinking::ReasoningEffort(effort)) => body["reasoning_effort"] = json!(effort),
        Some(Thinking::ThinkingBudget(tokens)) => {
            body["generationConfig"]["thinkingConfig"] = json!({"thinkingBudget":tokens})
        }
        Some(Thinking::ThinkingLevel(level)) => {
            body["generationConfig"]["thinkingConfig"] = json!({"thinkingLevel":level})
        }
        Some(Thinking::BudgetTokens(tokens)) => {
            body["thinking"] = json!({"type":"enabled","budget_tokens":tokens})
        }
        Some(Thinking::AdaptiveEffort(effort)) => {
            body["thinking"] = json!({"type":"adaptive"});
            body["output_config"] = json!({"effort":effort});
        }
        Some(Thinking::Disabled) => body["thinking"] = json!({"type":"disabled"}),
        Some(Thinking::OpenrouterEffort(effort)) => body["reasoning"] = json!({"effort":effort}),
    }
}
