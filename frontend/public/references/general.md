<!-- markdownlint-disable MD033 -->

<h1 id="ref-general-platform">LDaCA Wordflow</h1>

Version {{VERSION}}

## How to cite LDaCA Wordflow

If you use LDaCA Wordflow in your research, please include the following statement (or an appropriate variation):

> This study has utilised **LDaCA Wordflow**, developed for the Language Data Commons of Australia (LDaCA), available at [https://www.ldaca.edu.au](https://www.ldaca.edu.au), with concept DOI [10.5281/zenodo.20408328](https://doi.org/10.5281/zenodo.20408328).

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

© Language Data Commons of Australia (LDaCA)



## Stopword list sources and licences

LDaCA-provided presets retain the classic Wordflow lists from archived backend revision `91278ed2` (v0.7 reference `3cd4deda4`). They are additions to the licensed lists supplied by the [stopword library](https://github.com/fergiemcdowall/stopword), whose per-language source and licence notices remain in that package.

- **English (231 words):** Wordflow's manually maintained list, revised by Monika Bednarek in backend revision `d3784a49`.
- **French (146) and Spanish (151):** subsets of the [Snowball lists](https://snowballstem.org/), via NLTK. Snowball uses the [BSD 3-clause licence](https://github.com/snowballstem/snowball/blob/main/COPYING).
- **Japanese (310):** SlothLib, Kyoto University, Modified BSD, as attributed in the archived list. The original distribution was at [SlothLib](https://sourceforge.net/projects/slothlib/).
- **Korean (679):** [stopwords-iso/stopwords-ko](https://github.com/stopwords-iso/stopwords-ko), [MIT licence](https://github.com/stopwords-iso/stopwords-ko/blob/master/LICENSE), copyright 2016 Gene Diaz.

The classic Chinese list and the classic German list are excluded because their complete licensing provenance is unproven. Licensed library alternatives remain available.
