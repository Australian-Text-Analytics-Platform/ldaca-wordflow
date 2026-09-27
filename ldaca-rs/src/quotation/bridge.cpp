#include "ldaca-rs/src/quotation/bridge.rs.h"
#include <sstream>
#include <stdexcept>
#include <utility>

namespace wordflow_quotation {
using ufal::udpipe::model;
using ufal::udpipe::sentence;
using ufal::udpipe::input_format;
using ufal::udpipe::string_piece;

Model::Model(std::unique_ptr<model> loaded) : model_(std::move(loaded)) {}

std::unique_ptr<Model> load_model(rust::Slice<const std::uint8_t> bytes) {
    std::string data(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    std::istringstream input(data, std::ios::in | std::ios::binary);
    std::unique_ptr<model> loaded(model::load(input));
    if (!loaded) throw std::runtime_error("Cannot load UDPipe model data");
    return std::make_unique<Model>(std::move(loaded));
}

rust::Vec<Sentence> Model::parse(rust::Str text) {
    std::unique_ptr<input_format> tokenizer(model_->new_tokenizer(model::TOKENIZER_RANGES));
    if (!tokenizer) throw std::runtime_error("Cannot create UDPipe tokenizer");
    tokenizer->set_text(string_piece(text.data(), text.size()), true);
    rust::Vec<Sentence> output;
    sentence parsed;
    std::string error;
    while (tokenizer->next_sentence(parsed, error)) {
        if (!model_->tag(parsed, model::DEFAULT, error))
            throw std::runtime_error("UDPipe tagging failed: " + error);
        if (!model_->parse(parsed, model::DEFAULT, error))
            throw std::runtime_error("UDPipe parsing failed: " + error);
        Sentence result;
        for (std::size_t i = 1; i < parsed.words.size(); ++i) {
            const auto& word = parsed.words[i];
            if (word.id <= 0 || word.head < 0)
                throw std::runtime_error("Invalid UDPipe dependency index");
            result.words.push_back(Word{static_cast<std::uint32_t>(word.id),
                static_cast<std::uint32_t>(word.head), word.form, word.upostag, word.deprel});
        }
        std::size_t multi = 0;
        for (std::size_t i = 1; i < parsed.words.size();) {
            const ufal::udpipe::token* token = &parsed.words[i];
            std::size_t last = i;
            if (multi < parsed.multiword_tokens.size() &&
                static_cast<std::size_t>(parsed.multiword_tokens[multi].id_first) == i) {
                const auto& mwt = parsed.multiword_tokens[multi++];
                token = &mwt;
                last = static_cast<std::size_t>(mwt.id_last);
            }
            std::size_t start = 0, end = 0;
            if (!token->get_token_range(start, end))
                throw std::runtime_error("UDPipe omitted an original token range");
            result.tokens.push_back(Token{static_cast<std::uint32_t>(i),
                static_cast<std::uint32_t>(last), start, end});
            i = last + 1;
        }
        output.push_back(std::move(result));
    }
    if (!error.empty()) throw std::runtime_error("UDPipe tokenization failed: " + error);
    return output;
}
}
