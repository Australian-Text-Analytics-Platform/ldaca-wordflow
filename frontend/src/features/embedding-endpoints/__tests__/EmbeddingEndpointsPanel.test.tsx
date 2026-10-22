import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EmbeddingEndpointsPanel } from '../EmbeddingEndpointsPanel';
import type { EmbeddingEndpoint } from '../embeddingEndpoints';

const ENGLISH = 'sentence-transformers/all-MiniLM-L6-v2';
const MULTILINGUAL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2';

const state = vi.hoisted(() => ({
  endpoints: [] as EmbeddingEndpoint[] | undefined,
  canAdd: true,
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  check: vi.fn(),
  listModels: vi.fn(),
}));

vi.mock('../embeddingEndpoints', () => ({
  useEmbeddingEndpoints: () => ({
    endpoints: state.endpoints,
    canAdd: state.canAdd,
    isError: false,
    retry: vi.fn(),
  }),
  useEmbeddingEndpointActions: () => ({
    add: { mutateAsync: state.add, isPending: false },
    update: { mutateAsync: state.update, isPending: false },
    remove: { mutateAsync: state.remove, isPending: false },
    check: { mutateAsync: state.check, isPending: false },
    listModels: { mutateAsync: state.listModels, isPending: false },
  }),
}));

const server: EmbeddingEndpoint = {
  id: 'server-gpu',
  name: 'Research GPU',
  base_url: 'https://research-gpu.server-ai.invalid/v1',
  source: 'server',
  has_api_key: true,
  models: { [ENGLISH]: 'minilm-l6' },
  default: true,
};
const mine: EmbeddingEndpoint = {
  id: 'lab-gpu',
  name: 'Lab GPU',
  base_url: 'http://localhost:8000/v1',
  source: 'user',
  has_api_key: true,
  models: { [ENGLISH]: ENGLISH, [MULTILINGUAL]: MULTILINGUAL },
  default: false,
};

describe('EmbeddingEndpointsPanel', () => {
  beforeEach(() => {
    state.endpoints = [server, mine];
    state.canAdd = true;
    for (const action of [state.add, state.update, state.remove, state.check, state.listModels])
      action.mockReset();
  });

  it("shows the server's endpoint read-only and the person's own with actions", () => {
    render(<EmbeddingEndpointsPanel />);

    expect(
      screen.getByText('Provided by this Wordflow server · English (minilm-l6)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(
      screen.getByText('http://localhost:8000/v1 · English, Multilingual'),
    ).toBeInTheDocument();
    expect(screen.getByText('Key saved')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Check' })).toHaveLength(2);
  });

  it('reports a check in plain words', async () => {
    state.check.mockResolvedValue({
      reachable: true,
      served_models: [ENGLISH],
      available: { [ENGLISH]: true, [MULTILINGUAL]: false },
      message: `Multilingual: ${MULTILINGUAL}: Lab GPU doesn't have this model (HTTP 404)`,
    });
    render(<EmbeddingEndpointsPanel />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Check' })[1] as HTMLElement);

    expect(await screen.findByText(/^Ready: English\./)).toBeInTheDocument();
    expect(state.check).toHaveBeenCalledWith('lab-gpu');
  });

  it('checks the key and lists the models before an endpoint can be added', async () => {
    state.endpoints = [];
    state.add.mockResolvedValue(mine);
    state.listModels.mockResolvedValue({
      reachable: true,
      models: ['minilm-en', 'minilm-multilingual'],
      suggested: { [ENGLISH]: 'minilm-en', [MULTILINGUAL]: 'minilm-multilingual' },
      message: null,
    });
    render(<EmbeddingEndpointsPanel />);
    expect(
      screen.getByText('No Topic Modelling servers. Topic Modelling reads text on this computer.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lab GPU' } });
    fireEvent.change(screen.getByLabelText('Address'), {
      target: { value: 'https://gateway.example/v1' },
    });
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'sk-lab' } });
    const addButton = () =>
      screen.getAllByRole('button', { name: 'Add server' }).find((b) => dialog.contains(b));
    // Nothing can be saved before the key is checked and a model chosen.
    expect(addButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Found 2 models.')).toBeInTheDocument();
    expect(state.listModels).toHaveBeenCalledWith({
      base_url: 'https://gateway.example/v1',
      api_key: 'sk-lab',
    });
    expect(screen.getByLabelText('English')).toHaveTextContent('minilm-en');
    expect(screen.getByLabelText('Multilingual')).toHaveTextContent('minilm-multilingual');
    expect(addButton()).toBeEnabled();

    fireEvent.click(addButton() as HTMLElement);
    await waitFor(() => {
      expect(state.add).toHaveBeenCalledWith({
        name: 'Lab GPU',
        base_url: 'https://gateway.example/v1',
        models: { [ENGLISH]: 'minilm-en', [MULTILINGUAL]: 'minilm-multilingual' },
        api_key: 'sk-lab',
      });
    });
  });

  it('a refused key or a changed address keeps Add disabled', async () => {
    state.endpoints = [];
    state.listModels.mockResolvedValue({
      reachable: false,
      models: [],
      suggested: {},
      message: 'gateway.example refused the API key; check it.',
    });
    render(<EmbeddingEndpointsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lab GPU' } });
    fireEvent.change(screen.getByLabelText('Address'), {
      target: { value: 'https://gateway.example/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByText(/refused the API key/)).toBeInTheDocument();
    const addButton = screen
      .getAllByRole('button', { name: 'Add server' })
      .find((b) => dialog.contains(b));
    expect(addButton).toBeDisabled();

    state.listModels.mockResolvedValue({
      reachable: true,
      models: ['minilm-en'],
      suggested: { [ENGLISH]: 'minilm-en' },
      message: null,
    });
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'sk-right' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Found 1 model.')).toBeInTheDocument();
    expect(addButton).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Address'), {
      target: { value: 'https://other.example/v1' },
    });
    expect(screen.getByText('The address or key changed: check again.')).toBeInTheDocument();
    expect(addButton).toBeDisabled();
  });

  it('editing a saved endpoint lists its models with the saved key', async () => {
    state.listModels.mockResolvedValue({
      reachable: true,
      models: [ENGLISH, MULTILINGUAL],
      suggested: { [ENGLISH]: ENGLISH, [MULTILINGUAL]: MULTILINGUAL },
      message: null,
    });
    render(<EmbeddingEndpointsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(await screen.findByText('Found 2 models.')).toBeInTheDocument();
    expect(state.listModels).toHaveBeenCalledWith({
      base_url: 'http://localhost:8000/v1',
      endpoint_id: 'lab-gpu',
    });
  });

  it('a shared server only lists its own endpoints', () => {
    state.endpoints = [server];
    state.canAdd = false;
    render(<EmbeddingEndpointsPanel />);

    expect(
      screen.getByText("This Wordflow server provides these; they can't be changed here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add server' })).not.toBeInTheDocument();
  });
});
