export default class PreviewHost {
  onPrepare(): Promise<void>;
  onWorkerStart(): Promise<void>;
  onWorkerEnd(): Promise<void>;
  onComplete(): Promise<void>;
}
