export default class ServerHost {
  onPrepare(): Promise<void>;
  onComplete(): Promise<void>;
}
