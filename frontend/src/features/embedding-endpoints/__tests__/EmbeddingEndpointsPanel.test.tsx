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
    for (const action of [state.add, state.update, state.remove, state.check]) action.mockReset();
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

  it('adds an endpoint with its address, key and model names', async () => {
    state.endpoints = [];
    state.add.mockResolvedValue(mine);
    render(<EmbeddingEndpointsPanel />);
    expect(
      screen.getByText('No Topic Modelling servers. Topic Modelling reads text on this computer.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lab GPU' } });
    fireEvent.change(screen.getByLabelText('Address'), {
      target: { value: 'http://localhost:8000/v1' },
    });
    fireEvent.change(screen.getByLabelText(/API key/), { target: { value: 'sk-lab' } });
    fireEvent.change(screen.getByLabelText('Multilingual'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    await waitFor(() => {
      expect(state.add).toHaveBeenCalledWith({
        name: 'Lab GPU',
        base_url: 'http://localhost:8000/v1',
        models: { [ENGLISH]: ENGLISH },
        api_key: 'sk-lab',
      });
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
