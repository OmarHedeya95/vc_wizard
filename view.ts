import { ItemView, WorkspaceLeaf } from "obsidian";

export const WIZARD_VIEW = "wizard-view";

export class WizardView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.icon = 'sun'
  }

  getViewType() {
    return WIZARD_VIEW;
  }

  getDisplayText() {
    return "Related Ideas";
  }


  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h4", {text: "Related Ideas", cls: "heading"});
  }

  async update(search_results: any){ //
    const container = this.containerEl.children[1];
    //container.createEl("div", {text: "Hello World"})
    container.empty()
    const outerDiv = container.createEl("h4", {text: "Related Ideas\n", cls: "heading"});
    
    for (const key in search_results){

      let source_name = key
      let source_path = search_results[key]['source_path']
      let text = search_results[key]['text']
      const quote = container.createEl("blockquote", {text: text, cls: "quote"})
      const link = quote.createEl("a", { href: source_path, attr: { "data-path": source_path } });
      link.createEl("span", {   
                  text: '\n--' + source_name 
          }
      );



    }

    //container.createEl("div", {text: results.at(0)})
    //outerDiv.createEl("div", { text: "" });
    //outerDiv.createEl("div", { cls: "outgoing-link-header", text: "⛰" });
    

  }

  async onClose() {
    // Nothing to clean up.
  }
}