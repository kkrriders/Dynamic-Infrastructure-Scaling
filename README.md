# Dynamic Infrastructure Scaling with Ollama

An AI-driven solution for automatically scaling Azure infrastructure based on recommendations from Ollama models.

## Overview

This project provides an intelligent scaling solution for Azure Virtual Machine Scale Sets (VMSS) by leveraging Ollama large language models (LLMs) to analyze recent metrics and recommend optimal instance counts. The system is designed to work with various Ollama models, with built-in fallback mechanisms and confidence scoring.

## Features

- Automatic collection of recent metrics from Azure Monitor
- Integration with Ollama API for scaling recommendations with confidence scoring
- Intelligent model selection with primary and fallback models
- Advanced prompt engineering for cloud-specific reasoning
- Configurable prompts for Ollama interaction
- Robust execution of scaling actions on Azure VMSS
- Command-line tool support for metrics collection and scaling checks
- API Server for monitoring and potential manual control (optional)

## Architecture

The solution consists of the following main components:

1. **Metrics Collector**: Fetches recent infrastructure metrics from Azure Monitor (`scripts/fetch-metrics.js`).
2. **Ollama Service**: Communicates with a running Ollama instance via its API, with support for multiple models and fallback mechanisms (`src/services/ollamaService.js`).
3. **Scaling Scheduler**: Orchestrates the process: fetches metrics, constructs prompts, gets recommendations from Ollama with confidence scores, validates, and executes scaling actions (`scripts/schedule-scaling.js`).
4. **Azure Compute Client**: Interacts with the Azure API to get VMSS state and apply scaling changes.
5. **(Optional) API Server**: Provides a REST API for monitoring (`src/index.js`).

## Recommended Ollama Models

The system works best with these models:

- **llama3:70b** - Most accurate for complex resource decisions (requires more resources)
- **llama3:8b** - Good balance of performance and resource requirements
- **mistral:7b** - Efficient model for scaling decisions
- **mixtral:8x7b** - Strong reasoning for complex metrics analysis 
- **gemma:7b** - Efficient model with good reasoning

## Optimized for Llama3:8b

This system has been optimized for using Llama3:8b as the primary model for infrastructure scaling decisions. Optimizations include:

- Tuned model parameters for improved JSON formatting and reasoning
- Enhanced prompt templates designed for the 8B model's capabilities
- Adjusted confidence thresholds suitable for the model
- Reduced API timeouts for faster operation
- Trend analysis in metric processing for better decision-making

To use the optimized Llama3:8b configuration:

```bash
# Run with custom prompt template
node scripts/schedule-scaling.js --model=llama3:8b --prompt-file=config/llama3-8b-prompt.txt

# Or use the default configuration in .env which is already optimized
node scripts/schedule-scaling.js
```

The fallback model has been set to mistral:7b, which provides a good balance of efficiency and reasoning capability if the primary model fails.

## Prerequisites

- Node.js 18 or higher
- Azure subscription with VMSS resources
- Azure service principal with appropriate permissions (Contributor role on the VMSS is typically sufficient)
- Ollama installation running locally or accessible via network (refer to [Ollama Documentation](https://github.com/ollama/ollama))
- An appropriate Ollama model downloaded (e.g., `ollama pull llama3:70b` or `ollama pull llama3:8b`)

## Installation

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Copy the example environment file:

```bash
cp .env.example .env
```

4. **Configure `.env`: Update the `.env` file with your Azure credentials, VMSS details, and Ollama API endpoint/model.
   - Ensure `OLLAMA_API_URL` points to your running Ollama instance.
   - Choose a suitable `OLLAMA_MODEL` that you have downloaded.
   - Set `OLLAMA_FALLBACK_MODEL` to a lighter model as backup.
   - Configure `SCALING_CONFIDENCE_THRESHOLD` to set the minimum confidence score for accepting recommendations.
   - Review the default `OLLAMA_SYSTEM_PROMPT` or provide your own.

## Usage

### 1. Metrics Collection

Periodically fetch recent metrics from Azure Monitor and save them locally (or output to stdout). This script should typically be run via cron or a scheduler slightly more frequently than the scaling checks.

```bash
node scripts/fetch-metrics.js [options]
```

**Key Options:**

- `--resource-group=NAME`: Specify Azure Resource Group (overrides `.env`).
- `--vmss-name=NAME`: Specify VMSS Name (overrides `.env`).
- `--output-path=PATH`: Directory to save metrics files (default: `./data`).
- `--interval=MINUTES`: Aggregation interval for metrics (default: 15).
- `--lookback=HOURS`: How many hours of recent metrics to fetch (default: 1).
- `--vm-size=STRING`: Help calculate memory % if VMSS size isn't detected.
- `--no-save`: Prevent saving metrics to a file.
- `--stdout`: Output metrics JSON to stdout instead of saving.
- `--help, -h`: Show detailed help.

### 2. Scheduled Scaling

Run the scaling logic. This script fetches the latest metrics, asks Ollama for a recommendation, and applies the scaling change to Azure.
This script is intended to be run periodically (e.g., every 5-15 minutes via cron).

```bash
node scripts/schedule-scaling.js [options]
```

**Key Options:**

- `--dry-run`: Simulate scaling without making actual changes to Azure.
- `--metrics-path=PATH`: Directory containing metrics files (default: `./data`).
- `--min-instances=NUM`: Minimum VM instances (overrides `.env`).
- `--max-instances=NUM`: Maximum VM instances (overrides `.env`).
- `--cooldown=MINUTES`: Cooldown period between scaling actions (default: 15).
- `--prompt-file=FILE`: Use a custom prompt template file for Ollama.
- `--model=NAME`: Specify which Ollama model to use for this run.
- `--confidence-threshold=NUM`: Minimum confidence level (0-1) to accept recommendations.
- `--list-models`: Display available and recommended Ollama models.
- `--help, -h`: Show detailed help.

### 3. Managing Ollama Models

List available models and see recommendations:

```bash
node scripts/schedule-scaling.js --list-models
```

This will show:
1. Recommended models for cloud infrastructure scaling
2. Models currently available on your Ollama server

You can download a new model with the Ollama CLI:

```bash
ollama pull llama3:70b
# or for a lighter model
ollama pull llama3:8b
```

Then run with a specific model:

```bash
node scripts/schedule-scaling.js --model=llama3:70b
```

### 4. (Optional) Running the API Server

Start the optional API server for monitoring.

```bash
npm start
# or for development
npm run dev
```

**API Endpoints (Example - may need implementation):**

- `GET /api/status`: Get current status, last scaling action.
- `GET /api/metrics`: Get latest collected metrics.

## Ollama Interaction

- The `schedule-scaling.js` script constructs a detailed prompt containing the current VMSS state (instance count, VM size) and recent metrics (CPU %, Memory %, Network I/O). See `constructOllamaPrompt` function.
- It sends this prompt to the Ollama API specified in `.env` using the `ollamaService.js`.
- A system prompt guides Ollama to respond with a JSON object containing:
  ```json
  {
    "recommended_instances": 5,
    "confidence": 0.85,
    "reasoning": "CPU usage is consistently above 80% with increasing network traffic, suggesting the need for additional capacity."
  }
  ```
- The script validates both the recommendation and confidence level before proceeding.
- **Prompt Engineering**: You can customize the interaction by:
    - Modifying the `OLLAMA_SYSTEM_PROMPT` in `.env`.
    - Creating a template file and using the `--prompt-file` option with `schedule-scaling.js` for complex prompt logic.

## Fallback Mechanism

The system has a built-in fallback mechanism:
1. First tries the model specified in `OLLAMA_MODEL` (or via `--model` option)
2. If that fails (unavailable, times out, or returns invalid response), automatically tries the `OLLAMA_FALLBACK_MODEL`
3. Reports failures in logging but gracefully continues operation

## Confidence Scoring

The Ollama prompt requests a confidence score between 0-1:
- Only recommendations above the `SCALING_CONFIDENCE_THRESHOLD` (default: 0.7) are acted upon
- The reasoning field provides insight into the model's decision-making
- This prevents scaling based on uncertain recommendations

## Environment Variables

See `.env.example` for a complete list of required and optional environment variables.

**Key Variables:**

- `AZURE_*`: Azure authentication and resource identifiers.
- `OLLAMA_API_URL`: Base URL of your Ollama instance.
- `OLLAMA_MODEL`: The primary Ollama model tag to use.
- `OLLAMA_FALLBACK_MODEL`: Backup model to use if primary fails.
- `OLLAMA_SYSTEM_PROMPT`: Instructions for the Ollama model.
- `SCALING_CONFIDENCE_THRESHOLD`: Minimum confidence level (0-1) to accept recommendations.
- `METRICS_*`: Configuration for metrics collection.
- `SCALING_*`: Parameters controlling the scaling behavior (cooldown, retries).
- `MIN_INSTANCES`/`MAX_INSTANCES`: Hard limits for scaling.

## Troubleshooting

- **Ollama Errors**: Ensure Ollama is running, accessible at `OLLAMA_API_URL`, and the specified models are downloaded. Check Ollama server logs.
- **Model Selection Issues**: Run `node scripts/schedule-scaling.js --list-models` to see available models and verify your model is installed.
- **Azure Permission Errors**: Verify the service principal used has the necessary permissions (e.g., Contributor) on the VMSS and potentially the Resource Group.
- **Metrics Not Found**: Check if metrics collection (`fetch-metrics.js`) is running successfully and saving files to the correct `METRICS_PATH`.
- **Invalid Ollama Response**: Check Ollama server logs. Ensure the model understands the prompt and system prompt instructions. Experiment with different models or prompt tuning.
- **Low Confidence Scores**: If the system frequently reports low confidence scores, consider:
  - Using a more capable model
  - Adjusting the system prompt to provide more guidance
  - Lowering the confidence threshold if the recommendations appear sound despite lower scores

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.
