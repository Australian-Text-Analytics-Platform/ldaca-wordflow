import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

// The Rust runtime owns this handle through completion, including cancellation cleanup.
private final class Operation {
    var task: Task<Void, Never>?
}
public typealias Completion = @convention(c) (UnsafeMutableRawPointer?, Int32, UnsafePointer<CChar>) -> Void

@_cdecl("wordflow_fm_available")
public func available() -> Int32 {
#if canImport(FoundationModels)
    if #available(macOS 26, *) {
        switch SystemLanguageModel.default.availability {
        case .available: return 0
        case .unavailable(.deviceNotEligible): return 2
        case .unavailable(.appleIntelligenceNotEnabled): return 3
        case .unavailable(.modelNotReady): return 4
        @unknown default: return 4
        }
    }
    return 1
#else
    return 5
#endif
}

@_cdecl("wordflow_fm_start")
public func start(_ input: UnsafePointer<CChar>, _ context: UnsafeMutableRawPointer?, _ complete: @escaping Completion) -> UnsafeMutableRawPointer {
    let data = Data(String(cString: input).utf8)
    let operation = Operation()
    operation.task = Task {
        var status: Int32 = 1
        var output = "Apple Foundation Models is unavailable"
#if canImport(FoundationModels)
        if #available(macOS 26, *) {
            do {
                let request = try JSONDecoder().decode(Request.self, from: data)
                // Optional object properties work on macOS 26.0; nullable array elements require newer schemas.
                let code = DynamicGenerationSchema(name: "Code", anyOf: request.codes.isEmpty ? ["unused"] : request.codes)
                let item = DynamicGenerationSchema(name: "Prediction", properties: [.init(name: "label", description: "The code, omitted when none applies", schema: code, isOptional: true)])
                let array = DynamicGenerationSchema(arrayOf: item, minimumElements: request.count, maximumElements: request.count)
                let schema = try GenerationSchema(root: DynamicGenerationSchema(name: "Annotations", properties: [.init(name: "labels", description: "One prediction object per document, in input order", schema: array)]), dependencies: [])
                let session = LanguageModelSession(model: SystemLanguageModel.default, instructions: request.instructions + "\nFor guided generation, return prediction objects: each has an optional label property containing a Codebook code. Omit label when no code applies.")
                try Task.checkCancellation()
                let response = try await session.respond(to: request.documents, schema: schema, options: GenerationOptions(temperature: request.temperature))
                try Task.checkCancellation()
                let parsed = try JSONSerialization.jsonObject(with: Data(response.content.jsonString.utf8)) as? [String: Any]
                guard let rows = parsed?["labels"] as? [[String: Any]], rows.count == request.count else { throw InvalidOutput() }
                let labels: [Any] = rows.map { $0["label"] ?? NSNull() }
                output = String(decoding: try JSONSerialization.data(withJSONObject: ["labels": labels]), as: UTF8.self)
                status = 0
            } catch is CancellationError {
                status = 6; output = "Apple Foundation Models request cancelled"
            } catch {
                (status, output) = classify(error)
            }
        }
#endif
        output.withCString { complete(context, status, $0) }
    }
    return Unmanaged.passRetained(operation).toOpaque()
}
@_cdecl("wordflow_fm_cancel")
public func cancel(_ pointer: UnsafeMutableRawPointer) {
    Unmanaged<Operation>.fromOpaque(pointer).takeUnretainedValue().task?.cancel()
}
@_cdecl("wordflow_fm_release")
public func release(_ pointer: UnsafeMutableRawPointer) {
    Unmanaged<Operation>.fromOpaque(pointer).release()
}
private struct InvalidOutput: Error {}
private struct Request: Decodable {
    let instructions: String
    let documents: String
    let count: Int
    let codes: [String]
    let temperature: Double?
}
#if canImport(FoundationModels)
@available(macOS 26, *)
private func classify(_ error: Error) -> (Int32, String) {
    // Stable public errors, without echoing document text or model-internal diagnostics.
#if compiler(>=6.4)
    if #available(macOS 27, *), let failure = error as? LanguageModelError {
        switch failure {
        case .contextSizeExceeded: return (2, "Documents exceed the Apple model context window")
        case .rateLimited: return (3, "Apple Foundation Models is busy; retry shortly")
        case .guardrailViolation, .refusal: return (4, "Apple Foundation Models declined this document")
        case .unsupportedLanguageOrLocale: return (4, "Apple Foundation Models does not support this document language")
        case .timeout: return (5, "Apple Foundation Models timed out; inference was not retried")
        default: return (1, "Apple Foundation Models could not complete this request")
        }
    }
#endif
    if let failure = error as? LanguageModelSession.GenerationError {
        switch failure {
        case .exceededContextWindowSize: return (2, "Documents exceed the Apple model context window")
        case .rateLimited: return (3, "Apple Foundation Models is busy; retry shortly")
        case .guardrailViolation, .refusal: return (4, "Apple Foundation Models declined this document")
        case .unsupportedLanguageOrLocale: return (4, "Apple Foundation Models does not support this document language")
        case .decodingFailure: return (4, "Apple Foundation Models returned an invalid structured response")
        default: return (1, "Apple Foundation Models could not complete this request")
        }
    }
    return (1, "Apple Foundation Models could not complete this request")
}
#endif
