#pragma once
#include "rust/cxx.h"
#include "udpipe.h"
#include <memory>

namespace wordflow_quotation {
struct Sentence;
class Model {
public:
    explicit Model(std::unique_ptr<ufal::udpipe::model> model);
    rust::Vec<Sentence> parse(rust::Str text);
private:
    std::unique_ptr<ufal::udpipe::model> model_;
};
std::unique_ptr<Model> load_model(rust::Slice<const std::uint8_t> bytes);
}
