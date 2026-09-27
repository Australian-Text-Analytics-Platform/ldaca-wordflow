import Foundation
import JavaScriptCore
import Quartz
import UniformTypeIdentifiers

final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let url = request.fileURL
        let html = try await Task.detached(priority: .userInitiated) {
            let preview = ProjectPreview.read(url)
            let scriptURL = Bundle(for: PreviewProvider.self).url(forResource: "preview", withExtension: "js")!
            return try PreviewRenderer.render(preview, scriptURL: scriptURL)
        }.value
        return QLPreviewReply(dataOfContentType: .html, contentSize: CGSize(width: 1000, height: 700)) { reply in
            reply.stringEncoding = .utf8
            return Data(html.utf8)
        }
    }
}

enum PreviewRenderer {
    static func render(_ preview: ProjectPreview, scriptURL: URL) throws -> String {
        guard let context = JSContext() else { throw CocoaError(.coderInvalidValue) }
        context.evaluateScript(try String(contentsOf: scriptURL, encoding: .utf8))
        let model = try JSONSerialization.jsonObject(with: JSONEncoder().encode(preview))
        // Pass data as a value, never as executable JavaScript source.
        let result = context.objectForKeyedSubscript("WordflowPreview")?
            .objectForKeyedSubscript("renderPreview")?.call(withArguments: [model])
        guard context.exception == nil, let result, result.isString, let html = result.toString() else {
            throw NSError(domain: "WordflowPreview", code: 1, userInfo: [
                NSLocalizedDescriptionKey: context.exception?.toString() ?? "The preview renderer did not return HTML.",
            ])
        }
        return html
    }
}
