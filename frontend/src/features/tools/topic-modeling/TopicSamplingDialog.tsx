import { useState } from 'react';
import * as api from '@/features/project/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { topicKey, useTopicSampling } from './topicState';

export function TopicSamplingDialog({
  base,
  tab,
  request: initial,
  knownCounts,
  onClose,
  onConfirm,
}: {
  base: string;
  tab: string;
  request: api.TopicRequest;
  knownCounts: Map<string, number>;
  onClose: () => void;
  onConfirm: (request: api.TopicRequest, sampling: api.TopicSampling[]) => void;
}) {
  const [request] = useState(() => structuredClone(initial));
  const [choices, setChoices] = useState(() =>
    request.inputs.map(
      (input) =>
        useTopicSampling.getState().choices[topicKey(base, tab)]?.[api.targetKey(input.source)] ?? {
          mode: 'count' as const,
          count: 1000,
        },
    ),
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preview a sample</DialogTitle>
          <DialogDescription>
            Fit one joint model on randomly sampled documents. Run always uses all rows. Sampling
            may scan the sources; only sampled text is analysed.
          </DialogDescription>
        </DialogHeader>
        {request.inputs.map((input, index) => {
          const choice = choices[index];
          if (!choice) return null;
          const count = knownCounts.get(api.targetKey(input.source));
          return (
            <fieldset
              key={`${String(index)}-${api.targetKey(input.source)}`}
              className="space-y-2 rounded-md border p-3"
            >
              <legend className="max-w-full break-words px-1 font-medium">
                {input.source.name}
              </legend>
              <p className="text-description text-label-secondary">
                {count === undefined
                  ? 'Total count will be reported after sampling.'
                  : `${count.toLocaleString()} rows in the previous capture`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={choice.mode}
                  onValueChange={(mode) => {
                    setChoices((old) =>
                      old.map((c, i) =>
                        i === index
                          ? mode === 'percentage'
                            ? { mode: 'percentage', percentage: 10 }
                            : { mode: 'count', count: 1000 }
                          : c,
                      ),
                    );
                  }}
                >
                  <SelectTrigger aria-label={`${input.source.name} sampling`} className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">Document count</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  aria-label={`${input.source.name} sample size`}
                  className="w-28"
                  step={choice.mode === 'percentage' ? 'any' : 1}
                  min={choice.mode === 'count' ? 1 : 0.01}
                  max={choice.mode === 'count' ? Number.MAX_SAFE_INTEGER : 100}
                  value={
                    Number.isFinite(choice.mode === 'count' ? choice.count : choice.percentage)
                      ? choice.mode === 'count'
                        ? choice.count
                        : choice.percentage
                      : ''
                  }
                  onChange={(event) => {
                    const value = event.target.value === '' ? NaN : Number(event.target.value);
                    setChoices((old) =>
                      old.map((c, i) =>
                        i === index
                          ? c.mode === 'count'
                            ? { ...c, count: value }
                            : { ...c, percentage: value }
                          : c,
                      ),
                    );
                  }}
                />
              </div>
            </fieldset>
          );
        })}
        <p className="text-description">
          Random seed: {request.seed}. Duplicate documents remain separate rows.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={choices.some((choice) =>
              choice.mode === 'count'
                ? !Number.isSafeInteger(choice.count) || choice.count < 1
                : !Number.isFinite(choice.percentage) ||
                  choice.percentage <= 0 ||
                  choice.percentage > 100,
            )}
            onClick={() => {
              useTopicSampling
                .getState()
                .setChoices(
                  base,
                  tab,
                  Object.fromEntries(
                    request.inputs.map((input, i) => [
                      api.targetKey(input.source),
                      choices[i] ?? { mode: 'count', count: 1000 },
                    ]),
                  ),
                );
              onConfirm(request, choices);
              onClose();
            }}
          >
            Preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
