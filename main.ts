import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Menu, MenuItem, MarkdownFileInfo} from 'obsidian';

let pythonPath = ''
let scriptPath_AI = ''
let affinityAPIKey = ''
let openaiAPIKey = ''
let owner_value = '10'
let connection_owner_field = '10'
let venture_network_list = '500'



async function summarize_selected_startup_text(editor: Editor, view: MarkdownView|MarkdownFileInfo){
    /**
     * This function takes the selected text from a startup, summarizes it, and then puts it back in the file
     * The "full-text" gets appened after the heading '# Stop Indexing' such that it is not indexed anymore by the embedding engine
     * This also helps to avoid pushing all of the convoluted text into Affinity later on
     */
    const sel = editor.getSelection()
    //console.log(`Your Text: ${sel}`)
    let scriptPath = scriptPath_AI
    const scriptName = 'startup_summarizer_helper.py'
    var args = [sel, openaiAPIKey]
    new Notice("Summarizing...")
    //We declare get_selected_text as a function that "WAITS" (async), and we wait for the result here
    const summary = await launch_python(pythonPath, scriptPath, scriptName, args)

    let new_summary: string = String(summary)
    //Create new lines in the summary (somehow it gets lost between Python and Javascript)
    new_summary = new_summary.replace(/,-/g, '\n-')
    console.log(`The startup summary:\n ${new_summary}`)

    const replacement = '#gpt_summarized, #review_startup \n'+ new_summary + '\n' + '# Stop Indexing \n## Notes\n' + sel
    editor.replaceSelection(replacement)

}

async function launch_python(pythonPath: string, scriptPath: string, scriptName: string, args: any){
    /**
     * This function launches a python script with the correct python virtual environment and returns whatever the python script prints!! (no value passing, take care)
     */
    let {PythonShell} = require('python-shell')
    const options = {mode: 'text', pythonPath: pythonPath, scriptPath: scriptPath, args: args}
    const result = await new Promise((resolve, reject) => {
            PythonShell.run(scriptName, options, function (err: Error, results: any) {
                if (err)
                    throw err;
                return resolve(results);
        });
    });

    return result

}

async function summarize_vc_text(text: string){
    /**
     * Given the full text in a VC note, this function summarizes the important part (before # Stop Indexing) and returns the new full text that should be written to the file
     * The full text includes the meta data and tags information before the title, the title, the summary, and adds the core data after the heading "# Stop Indexing"
     */
    const scriptPath = scriptPath_AI
    const scriptName = 'vc_summarizer_helper.py'

    // We should summarize only information that is before '# Stop Indexing'
    let [title, substrings] = extract_title_and_note(text)
    let text_to_summarize = substrings[0] + '\n' + substrings[1]

    console.log(`Summarizing: ${title}`)
    //console.log("Text to summarize: ")
    //console.log(text_to_summarize)

    var args = ['Notes:\n' + text_to_summarize + 'Summary:\n', openaiAPIKey] //text
    //We declare get_selected_text as a function that "WAITS" (async), and we wait for the result here
    
    const summary = await launch_python(pythonPath, scriptPath, scriptName, args)
    let new_summary: string = String(summary)
    //Separate different bullet points
    new_summary = new_summary.replace(/,-/g, '\n-')

    
    title = title.toString()
    let leading_text = ''
    let replacement = ''
    let tailing_text = ''

    /*console.log(`Title: ${title}`)
    console.log(`Before the title:\n${substrings[0]}`)
    console.log(`After the title: ${substrings[1]}`)*/

    if(substrings){
        leading_text = substrings[0] + '\n' + title + '\n'
        for (let substring of substrings.slice(1)){
            tailing_text = tailing_text + '\n' + substring
        }
        replacement = leading_text + '#gpt_summarized, #review \n'+ new_summary + '\n' + '# Stop Indexing \n## Notes\n' + tailing_text
        return [replacement, new_summary, title]
    }
    else{
        return [text, text, '']

    }

    
}


function create_notice(){
    new Notice("Nice to meet you!")
}

function extract_title_and_note(text: string){
    /**
     * This function takes all the text in the file and returns the title and the body of the note.
     * The split happens based on h1 header. 
     * This means substrings[0] is usually the data before the title.
     * substrings[1] is usually the body of the note
     * if there is substring [2], this means there is another h1 header (usually # Stop Indexing)
     * Downstream tasks only deals with substring[1] as the note; i.e information after the Stop Indexing are execluded
     */

        //?gm means string is multilines, and ^ would catch beginning of every line not just beginning of the string!
        let pattern = /^# .*\n/gm;
        let matches = text.match(pattern);
        let title = ''
        if(matches){
            title = matches[0]
        }
        let substrings = text.split(pattern)
        console.log(`Title: ${title}`)
        console.log(substrings)

        return [title, substrings]

}

function extract_summary(full_note:string){
    //When a note is ready (has gpt_summarized and Affinity tags), extract the summary from full text
    let substrings = full_note.split('# Stop Indexing')
    let summary = substrings[0]
    //console.log(`Summary: ${summary}`)
    return summary
}

async function update_affinity(note: string, entity_name:string, scriptName: string){
    const scriptPath = scriptPath_AI
    if (scriptName == 'affinity_vc_helper.py'){
        var args = [entity_name, note, affinityAPIKey, owner_value, connection_owner_field, venture_network_list]

    }
    else{
        var args = [entity_name, note, affinityAPIKey, owner_value]

    }
    
    console.log("Update Affinity")
    const response = await launch_python(pythonPath, scriptPath, scriptName, args)

    console.log(response)
    return response

}

function vc_ready_for_affinity(file_content: string){
    return file_content.includes('#gpt_summarized') && file_content.includes('#Affinity')
}

function startup_ready_for_affinity(file_content: string){
    return (file_content.includes('#startups/screened') && file_content.includes('#Affinity'))
}

function notify_for_missing_people(person_name: string, response: any){
    /**
     * If a person is not found in affinity, send a notification and return false
     */
    for (let item of response){
        if (item.includes('Oops')){
            new Notice(`Person: ${person_name} was not found`, 36000)
            return true
        }

    }   
    return false
}

function notify_for_missing_startups(startup_name: string, response: any){
    for (let item of response){
        if(item.includes('Error')){
            new Notice(`Startup: ${startup_name} was found but could not be updated`, 36000)
            return true
        }
        else if (item.includes('Startup')){
            new Notice(`Startup: ${startup_name} could not be found`, 36000)
            return true
        }
    }
    return false
}

async function push_vcs_to_affinity(){
    /**
     * This function pushes all ready VCs to affinity, it also notifies us if a person can not be found on affinity
     */
    const files = this.app.vault.getMarkdownFiles()
    for (let item of files){
        let file_content = await this.app.vault.read(item)
        if (vc_ready_for_affinity(file_content)){
            
            let [title, substrings] = extract_title_and_note(file_content)
            let summary = substrings[1] //extract_summary(substrings[1])
            let person_name = String(title)
            let scriptName = 'affinity_vc_helper.py'
            let response: any = await update_affinity(summary, person_name, scriptName)
            if (!notify_for_missing_people(person_name, response)){
                //if the person was updated on affinity successfuly and not missing from database, remove #Affinity from text
                new Notice(`VC: ${person_name} was updated on Affinity`)
                file_content = file_content.replace(/#Affinity/g, '')
                this.app.vault.modify(item, file_content)

            }
        

        }

    }

}


async function push_startups_to_affinity(){
    /**
     * Push all eligible startups to affinity (notify me otherwise)
     */
    const files = this.app.vault.getMarkdownFiles()
    for (let item of files){
        let file_content = await this.app.vault.read(item)
        if (startup_ready_for_affinity(file_content)){
            let [title, substrings] = extract_title_and_note(file_content)
            let startup_name = String(title)
            let note = substrings[1]
            //console.log(`Startup name: ${startup_name}`)
            //console.log(`Note: ${note}`)
            let scriptName = 'affinity_startup_helper.py'
            let response: any = await update_affinity(note, startup_name, scriptName)

            if (!notify_for_missing_startups(startup_name, response)){
                new Notice(`Startup: ${startup_name} was updated on Affinity`)
                file_content = file_content.replace(/#Affinity/g, '')
                this.app.vault.modify(item, file_content)
            }



        }

    }
    new Notice('Done!')
}

function is_summarizable(file_content: string){
    /**
     * Return true if the VC is to be summarized (I am connected with them and they are not already summarized)
     */
    return file_content.includes('#network/connected') && ( file_content.includes('#Entity/VC') || file_content.includes('#Person/VC') ) && (file_content.includes('#gpt_summarized') != true) && (file_content.includes('dataview') != true)

}

interface ButlerSettings {
	vaultPath: string;
    affinityKey: string;
    openAIKey: string;
    owner_person_value: string;
    connection_owner_field_id: string;
    venture_network_list_id: string;
    pythonPath: string

}

const DEFAULT_SETTINGS: ButlerSettings = {
	vaultPath: 'default',
    affinityKey: 'default',
    openAIKey: 'default',
    owner_person_value: '10',
    connection_owner_field_id: '100',
    venture_network_list_id: '500',
    pythonPath: '<path-to-virtual-env>'

}

export default class VCWizardPlugin extends Plugin{
    settings: ButlerSettings;
    async onload() {
        await this.loadSettings();
        

        this.addRibbonIcon('sun', 'Omar Plugin', create_notice)
            
        this.addCommand({id: 'summarize-startup-command', name: 'Summarize This Startup', editorCallback: (editor, view) => summarize_selected_startup_text(editor, view)})

        this.addCommand({id: 'summarize-all-vc-command', name: 'Summarize All VC Notes', callback: () => this.summarize_all_vc()})

        this.addCommand({id: 'affinity-vc', name: 'Push VCs to Affinity', callback: () => push_vcs_to_affinity()})

        this.addCommand({id: 'affinity-startup', name: 'Push Startups to Affinity', callback: () => push_startups_to_affinity()})

        this.addSettingTab(new SampleSettingTab(this.app, this));
    
    }

    onunload() {

    }

    async loadSettings(){
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        scriptPath_AI = this.settings.vaultPath + '.obsidian/plugins/vc_wizard'
        openaiAPIKey = this.settings.openAIKey
        affinityAPIKey = this.settings.affinityKey
        owner_value = this.settings.owner_person_value
        connection_owner_field = this.settings.connection_owner_field_id
        venture_network_list = this.settings.venture_network_list_id
        pythonPath = this.settings.pythonPath
    }

    async saveSettings(){
        await this.saveData(this.settings)
        scriptPath_AI = this.settings.vaultPath + '.obsidian/plugins/vc_wizard'
        openaiAPIKey = this.settings.openAIKey
        affinityAPIKey = this.settings.affinityKey
        owner_value = this.settings.owner_person_value
        connection_owner_field = this.settings.connection_owner_field_id
        venture_network_list = this.settings.venture_network_list_id
        pythonPath = this.settings.pythonPath
    }

    async summarize_all_vc(){
        /**
         * This function summarized all VC notes that are eligible for summarization (people or entities I am connected with)
         */

        const files = this.app.vault.getMarkdownFiles()
        for (let item of files){
            //console.log(item.name)
            let file_content = await this.app.vault.read(item)
            if (is_summarizable(file_content)){
                console.log(`We are changing file: ${item.name}`)
                //We should summarize this file then
                let [new_text, summary, title] = await summarize_vc_text(file_content)
                if (title != ''){
                    this.app.vault.modify(item, new_text)
                    new Notice(`${title} has been summarized`)

                }
                

                

            }
            
        }
        

        //vault.

        

    }
}

class SampleSettingTab extends PluginSettingTab{
    plugin: VCWizardPlugin
    constructor(app: App, plugin: VCWizardPlugin){
        super(app, plugin)
        this.plugin = plugin
    }
    display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for your butler'});

		new Setting(containerEl)
			.setName('Obsidian Vault Path')
			.setDesc('The path to the vault where you wish to use the plugin')
			.addText(text => text
				.setPlaceholder('Enter path')
				.setValue(this.plugin.settings.vaultPath)
				.onChange(async (value) => {
					console.log('path: ' + value);
					this.plugin.settings.vaultPath = value;
					await this.plugin.saveSettings();
				}));
        new Setting(containerEl)
        .setName('OpenAI API Key')
        .setDesc('Your OpenAI API Key')
        .addText(text => text
            .setPlaceholder('Enter key')
            .setValue(this.plugin.settings.openAIKey)
            .onChange(async (value) => {
                console.log('Open AI key: ' + value);
                this.plugin.settings.openAIKey = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Affinity: API Key')
        .setDesc('Your Affinity API Key')
        .addText(text => text
            .setPlaceholder('Enter key')
            .setValue(this.plugin.settings.affinityKey)
            .onChange(async (value) => {
                console.log('key: ' + value);
                this.plugin.settings.affinityKey = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Affinity: Owner Value')
        .setDesc('Every person has a code on Affinity. Please give in the code for the person that should be added as owner of startups and VCs that gets pushed')
        .addText(text => text
            .setPlaceholder('Enter value')
            .setValue(this.plugin.settings.owner_person_value)
            .onChange(async (value) => {
                console.log('Owner value: ' + value);
                this.plugin.settings.owner_person_value = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Affinity: Connection Owner Field ID')
        .setDesc('Depending on the list you save fellow VCs in, there is a field that represent the \'connection owner with the fund\', enter the field id here')
        .addText(text => text
            .setPlaceholder('Enter value')
            .setValue(this.plugin.settings.connection_owner_field_id)
            .onChange(async (value) => {
                console.log('Connection Owner Field ID value: ' + value);
                this.plugin.settings.connection_owner_field_id = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Affinity: Venture Network List ID')
        .setDesc('Please enter the list id for the list you save your relationships with VCs in')
        .addText(text => text
            .setPlaceholder('Enter value')
            .setValue(this.plugin.settings.venture_network_list_id)
            .onChange(async (value) => {
                console.log('Venture network list id: ' + value);
                this.plugin.settings.venture_network_list_id = value;
                await this.plugin.saveSettings();
            }));
        new Setting(containerEl)
        .setName('Python Virtual Environment Path')
        .setDesc('The path to python virtual environment')
        .addText(text => text
            .setPlaceholder('Enter path')
            .setValue(this.plugin.settings.pythonPath)
            .onChange(async (value) => {
                console.log('PythonPath: ' + value);
                this.plugin.settings.pythonPath = value;
                await this.plugin.saveSettings();
            }));
	}

}