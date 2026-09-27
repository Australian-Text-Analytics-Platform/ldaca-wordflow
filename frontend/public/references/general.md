<!-- markdownlint-disable MD033 -->

<h1 id="ref-general-platform">LDaCA Wordflow</h1>


## How to cite LDaCA Wordflow

If you use LDaCA Wordflow in your research, please include the following statement (or an appropriate variation):

> This study has utilised **LDaCA Wordflow**, developed for the Language Data Commons of Australia (LDaCA), available at [https://www.ldaca.edu.au](https://www.ldaca.edu.au).

Where relevant, please also cite specific tools, notebooks, datasets, or software releases used in your analysis (e.g. via provided DOIs or repository references). For the latest version or updates, please visit the [GitHub repository](https://github.com/Australian-Text-Analytics-Platform/Ldaca_Text_Analytics_Tools).

In addition, we kindly ask that you inform the LDaCA team of publications and grant applications that derive from the use of LDaCA Wordflow or other LDaCA tools, where feasible. This helps support ongoing development and sustainability of the platform.

---

## Acknowledgements

LDaCA Wordflow and associated LDaCA tools were developed by the **Sydney Informatics Hub (SIH)** and **Sydney Corpus Lab** in collaboration with partners across the **Language Data Commons of Australia (LDaCA)**.

LDaCA and its associated tools have received investment from the **Australian Research Data Commons (ARDC)**, which is enabled by the **National Collaborative Research Infrastructure Strategy (NCRIS)**.

---

## Key Developers and Contributors

The design, development, and maintenance of LDaCA Wordflow have been led and supported by staff from the [**Sydney Informatics Hub (SIH)**](https://informatics.sydney.edu.au/) and [**Sydney Corpus Lab**](https://sydneycorpuslab.com/):

- _**Chao Sun**_
- _**Senhui (Alex) Guo**_
- _**Monika Bednarek**_
- *Michael Lynch*
- *Sebastian Hann*
- *Atiq Ur Rehman*
- *Kelvin Lee*


Their contributions span software engineering, research infrastructure development, data processing pipelines, user interface design, and research translation.

---

## Testing, Feedback, and Community Contributions

We gratefully acknowledge the contributions of researchers, collaborators, and community members who have supported LDaCA Wordflow through:

- User testing and pilot studies  
- Feedback on usability, features, and documentation  
- Reporting issues and suggesting improvements  
- Participating in workshops, demonstrations, and early‑adopter programs  

These contributions have been essential in ensuring that LDaCA Wordflow meets the needs of diverse research communities.

---

<h2 id="ref-stop-word-lists">Stop-word lists: sources and licences</h2>

Frequency and Topic Modelling offer ready-made stop-word lists. Their sources and licences are listed here.

**Wordflow classic lists**

| List | Source | Licence |
|---|---|---|
| English (231 words) | Wordflow's own list, revised by Monika Bednarek (Sydney Corpus Lab) | Part of Wordflow |
| French (146 words) | Subset of the [Snowball](https://snowballstem.org/) French stop list, as distributed with [NLTK](https://www.nltk.org/) | Snowball: BSD 3-Clause |
| Spanish (151 words) | Subset of the Snowball Spanish stop list, as distributed with NLTK | Snowball: BSD 3-Clause |
| German (131 words) | 104 words from the Snowball German stop list (via NLTK); the source of the other 27 words was not recorded | Snowball: BSD 3-Clause |
| Japanese (310 words) | The SlothLib stop-word list (Tanaka Laboratory, Kyoto University), as republished on [Kaggle](https://www.kaggle.com/datasets/lazon282/japanese-stop-words) | SlothLib: Modified BSD |
| Korean (679 words) | [stopwords-iso/stopwords-ko](https://github.com/stopwords-iso/stopwords-ko) | MIT, Copyright (c) 2016 Gene Diaz |

Earlier versions also offered a classic Chinese list from goto456/stopwords. It was removed in 0.7 because that list carries no licence. The library's Chinese list below is still available.

**Languages (stopword library)**

The lists for about 60 languages come from the open-source [`stopword`](https://github.com/fergiemcdowall/stopword) package (MIT, Copyright (c) 2015 to 2022 Fergus McDowall). Each language list keeps its own copyright notice, under the MIT or Apache 2.0 licence; the package ships them in its `dist/3rd-party.txt` file.

---

© Language Data Commons of Australia (LDaCA)

Version {{VERSION}} - released on {{BUILD_DATE}}.
