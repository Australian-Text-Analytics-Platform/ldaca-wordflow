# Server AI providers

A hosted Wordflow can offer its own LLMs for AI annotation, so people don't
need their own API keys. The server holds the key, sends each person's
requests to an OpenAI-compatible endpoint (for example a LiteLLM gateway in
front of vLLM), and can tell the gateway who each request is for.

Issue #411.

## What people see

- The server's providers are listed first under **Settings → Servers** (Generative AI) and in the
  Annotation **Provider** list, for every signed-in person. They are
  read-only: no key to enter, no Edit or Delete, and the list says
  "Provided by this Wordflow server".
- A new Annotation tab selects the first one, with its default model. A
  person's own **Default model** in Settings, or the model last used with the
  provider in the same Project, comes first.
- The **Model** list keeps the order set in the file and shows a one-line
  description under each model (from the file, or from the gateway; see
  [Model descriptions](#model-descriptions)).
- If a provider limits requests per person, **Requests at once** can't go
  above that limit, and a note says why. A person's second Run on that
  provider waits in the queue ("Waiting for your previous … run" in Tasks)
  while other people's Runs go ahead. A Preview during that person's Run is
  refused with a clear message.
- Rate limits (HTTP 429) from the gateway are waited out (following
  `Retry-After`, otherwise 2, 4, 8 … up to 60 seconds, about 3 minutes in
  all), so a busy gateway slows a Run down instead of failing its batches.
- People can still add their own providers. Those work as before.

## Configuration

Set `SERVER_AI_PROVIDERS_FILE` to a YAML file. Each provider's key goes in the
environment (the secret file), under the name the file gives:

```yaml
# /etc/ldaca-wordflow/ai-providers.yaml
providers:
  - slug: research               # letters, digits and hyphens; never change it
    name: Research LLM           # shown to people
    base_url: https://litellm.example.edu.au/v1
    api_key_env: RESEARCH_LLM_API_KEY
    models: [qwen3.8-27b, gemma-4-26b-a4b, ornith-1.5-35b-a3b]
    default_model: qwen3.8-27b
    model_descriptions:
      qwen3.8-27b: Fastest; good for large, straightforward classification runs.
    send_user: email
    max_requests_per_user: 1
```

| Field | Required | Meaning |
|---|---|---|
| `slug` | yes | Short id. Lower-case letters, digits and hyphens, up to 40. It names the provider inside Wordflow; keep it fixed once in use. |
| `name` | yes | What people see. |
| `configuration_id` | no | A fixed id (UUID) for the provider. By default it is made from the slug. Set it only to keep an id that saved Projects already use. |
| `base_url` | yes | The OpenAI-compatible API root. |
| `api_key_env` | yes | The name of the environment variable that holds the key. Start-up stops if it isn't set. |
| `models` | no | Offer and accept only these models, in this order. Without it, every model the endpoint lists is offered, in alphabetical order. |
| `default_model` | no | The model new tabs start on. Must be in `models` when that is set. |
| `model_descriptions` | no | Model id to one line of text (at most 200 characters). Wins over the gateway's own description. |
| `send_user` | no | What goes in the OpenAI `user` field: `email` (default), `subject` (the sign-in's stable id) or `none`. LiteLLM uses it to track spend per person. |
| `max_requests_per_user` | no | Requests at once per person (1 to 32). Empty means the Run's own **Requests at once** setting. |

A file with several providers lists them in that order. A wrong file, an
unknown field or a missing key stops start-up with a message that names the
problem; it never prints a key.

Without `SERVER_AI_PROVIDERS_FILE`, Wordflow offers no server providers and
behaves exactly as before.

### Model descriptions

The text under each model comes, in this order, from the file's
`model_descriptions`, a `description` on the endpoint's model list, or
LiteLLM's `GET {base_url}/model/info` (`model_info.description` for each
`model_name`). With LiteLLM, set the descriptions there and Wordflow shows a
change within 5 minutes.

## How the key and the person are kept safe

- **The key stays on the server.** The browser gets the provider's id and a
  placeholder address (`https://<slug>.server-ai.invalid/v1`) and sends no key.
  The server uses the real address and key only when it calls the endpoint.
  The key is never in an API response, a log line, an error, a saved Project
  or a person's credential file.
- **The `user` value comes from the signed-in session.** When a Run or Preview
  is submitted, the server looks up the account (email or subject) and passes a
  signed token to the worker instead of a key. The worker checks the signature,
  adds the key and the `user` field. A value from the browser is never used: a
  key typed in for a server provider is refused, and a token from one provider
  doesn't work for another.
- **Errors are cleaned.** Endpoint errors lose the provider's exception chain,
  and anything that looks like a key (`sk-…`, `Bearer …`, `api_key=…`) becomes
  `[redacted]`.
- **One process.** The per-person limits and the Analysis queue live in the
  server process. Run one process (as for any hosted Wordflow); don't add
  Uvicorn workers or replicas behind one data folder.
- **Other servers.** A Project made on a server with a provider this server
  doesn't offer opens normally; its saved results are kept. A new Preview or Run
  with that provider says the server doesn't offer it, and the person chooses
  another.

## Requests sent to the endpoint

An ordinary chat completion with `model`, `messages`, `temperature`,
`max_completion_tokens` and, if `send_user` isn't `none`, `user`. It also asks
for:

- `response_format` `json_schema` (strict): exactly one label per text, each a
  code or null (#406);
- `chat_template_kwargs.enable_thinking`, which follows the **Thinking** switch.

If the endpoint answers HTTP 400 to either, Wordflow sends the request again
without it, and stops sending it to that endpoint until the server restarts.
Each request closes its connection when it ends (#404).

## Embedding endpoints for Topic Modelling

The same file can list `embedding_endpoints`: OpenAI-compatible
`/v1/embeddings` servers that embed Topic Modelling's text on a remote GPU, for
example vLLM serving the two Sentence Transformers models, alone or behind the
same LiteLLM gateway as the LLMs. They are listed apart from `providers`, since
an embedding server need not run an LLM.

```yaml
embedding_endpoints:
  - slug: research-gpu
    name: Research GPU
    base_url: https://litellm.example.edu.au/v1
    api_key_env: RESEARCH_LLM_API_KEY
    models:
      sentence-transformers/all-MiniLM-L6-v2: minilm-l6
      sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2: minilm-l12-multilingual
    send_user: email
    default: true
```

| Key | Meaning |
| --- | --- |
| `slug`, `name`, `base_url`, `api_key_env` | As for `providers`. The key must be set at start-up and never leaves the server. |
| `endpoint_id` | Optional fixed id, so saved Topic Modelling runs keep pointing here. |
| `models` | Each Topic Modelling model the endpoint serves, with its name there. Leave a model out if it isn't served. |
| `send_user` | `email`, `subject` or `none`: the OpenAI `user` field, from the signed-in account. |
| `batch_size`, `concurrency` | Optional: texts per request (default 128) and requests in flight (default 4). |
| `default` | Ticks **Remote GPU** in new Topic Modelling tabs. |

People see these endpoints read-only in **Settings → Embedding endpoints** and
choose one with the **Remote GPU** tick beside **Max tokens** in Topic
Modelling. A run sends segments in batches to `POST {base_url}/embeddings`; a
failed request is retried, and a run that still fails stops with the endpoint's
error rather than embedding on the server's CPU, which would mix two embedding
spaces in one run. Without the tick, or without endpoints, Topic Modelling
embeds on the server's CPU as before. On a shared server people can't add their
own endpoints; on a desktop they add them with an API key in Settings.

Serve the models with vLLM, for example:

```bash
vllm serve sentence-transformers/all-MiniLM-L6-v2 --runner pooling --served-model-name minilm-l6
```
