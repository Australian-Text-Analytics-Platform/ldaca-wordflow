import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  partChain,
  type BuildBuilderToken,
  type BuildLiteralType,
} from '../hooks/buildExpressionModel';

type LiteralPart = Extract<BuildBuilderToken, { kind: 'literal' }>;
export function LiteralPopover({
  part,
  onConfirm,
  children,
}: {
  part?: LiteralPart;
  onConfirm: (part: LiteralPart) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<BuildLiteralType>('text');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setType(part?.literalType ?? 'text');
        setValue(part?.value ?? '');
        setError(null);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]" align="start">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const next: LiteralPart = {
              id: part?.id ?? crypto.randomUUID(),
              kind: 'literal',
              literalType: type,
              value,
              operations: part?.operations ?? [],
            };
            try {
              partChain({ ...next, operations: [] }, []);
              onConfirm(next);
              setOpen(false);
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : String(failure));
            }
          }}
        >
          <span className="font-medium">{part ? 'Edit value' : 'Add a value'}</span>
          <Select
            value={type}
            onValueChange={(next: BuildLiteralType) => {
              setType(next);
              setValue(next === 'boolean' ? 'false' : '');
              setError(null);
            }}
          >
            <SelectTrigger aria-label="Value type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(['text', 'number', 'boolean', 'null'] as const).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === 'null' ? 'NULL' : type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {type === 'text' ? (
            <Textarea
              aria-label="Literal value"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              placeholder="Enter text, without surrounding quotes"
            />
          ) : type === 'number' ? (
            <Input
              aria-label="Literal value"
              inputMode="decimal"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
            />
          ) : type === 'boolean' ? (
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger aria-label="Boolean value">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="true">True</SelectItem>
                  <SelectItem value="false">False</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-body text-description">A missing value, distinct from empty text.</p>
          )}
          {error && (
            <p role="alert" className="text-body text-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit">{part ? 'Save value' : 'Add value'}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
