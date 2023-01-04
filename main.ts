import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Menu, MenuItem, MarkdownFileInfo, TFile, TAbstractFile} from 'obsidian';
import { WizardView, WIZARD_VIEW } from 'view';
import * as fs from 'fs';

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

function save_json(file_path: string, content: any){
    const jsonString = JSON.stringify(content)
    fs.writeFile(file_path, jsonString, (err) => {
        if (err) {
          console.error(`Error saving the file: ${err}`);
          return;
        }
        console.log('File has been created');
      });
}

function append_to_json(file_path: string, key: any, value:any){
    fs.readFile(file_path, (err, data: any) => {
        if(err) {
            
            throw err;
        }

        let oldData 
        try{
           oldData = JSON.parse(data)
        }
        catch (e){
                // If the file is empty, data will be an empty string,
                // which will cause JSON.parse() to throw an error.
                // In this case, we set oldData to an empty object.
                oldData = {}
        }
        oldData[key] = value //{'change_type': FileType.modified, 'full_path': file_path} 
        const updatedJson = JSON.stringify(oldData)
        fs.writeFile(file_path, updatedJson, (err) => {
            if (err) throw err;
            console.log('Data appended to file')
        })


    });

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

enum FileType {
    modified = 'modified',
    deleted = 'deleted',
    new = 'new'
}

export default class VCWizardPlugin extends Plugin{
    settings: ButlerSettings;
    status: HTMLElement;
    async onload() {
        await this.loadSettings();
        this.status = this.addStatusBarItem();
        
        this.registerView(WIZARD_VIEW, (leaf)=> new WizardView(leaf))
        this.app.workspace.onLayoutReady(() => {
			this.activateView();
			this.updateView([]);
		});

        this.registerEvent(this.app.vault.on('modify', (file) => this.register_file_change(file, FileType.modified)))

        this.registerEvent(this.app.vault.on('delete', (file) => this.register_file_change(file, FileType.deleted)))
        this.addRibbonIcon('sun', 'Omar Plugin', create_notice)
            
        this.addCommand({id: 'summarize-startup-command', name: 'Summarize This Startup', editorCallback: (editor, view) => summarize_selected_startup_text(editor, view)})
        
        this.addCommand({id: 'index-vault', name: 'Index Vault', callback: () => this.index_vault()})

        this.addCommand({id: 'index-changed-files', name: 'Reindex New/Changed Files Only', callback: () => this.index_new_and_modified_files()})

        this.addCommand({id: 'find-similar-ideas', name: 'Find Similar Ideas', editorCallback: (editor, view) => this.find_similar_ideas(editor, view)})
    
        this.addCommand({id: 'summarize-all-vc-command', name: 'Summarize All VC Notes', callback: () => this.summarize_all_vc()})

        this.addCommand({id: 'affinity-vc', name: 'Push VCs to Affinity', callback: () => push_vcs_to_affinity()})

        this.addCommand({id: 'affinity-startup', name: 'Push Startups to Affinity', callback: () => push_startups_to_affinity()})

        this.addSettingTab(new SampleSettingTab(this.app, this));
        this.status.setText('🧙: VC Wizard ready')
        this.status.setAttr('title', 'Wizard is ready')

    
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(WIZARD_VIEW)
        this.status.setText('🧙: VC Wizard left')

    }

    async activateView() {
		this.app.workspace.detachLeavesOfType(WIZARD_VIEW);
		
		await this.app.workspace.getRightLeaf(false).setViewState({
		  type: WIZARD_VIEW,
		  active: true,
		});
	
		this.app.workspace.revealLeaf(
		  this.app.workspace.getLeavesOfType(WIZARD_VIEW)[0]
		);
	}
    async updateView(results: any) {
        const view = this.app.workspace.getLeavesOfType(WIZARD_VIEW)[0]?.view;
                    if (view instanceof WizardView) {
                        view.update(results)
                    }
                    
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
    async find_similar_ideas(editor: Editor, view: MarkdownView|MarkdownFileInfo){
        const sel = editor.getSelection()
        new Notice("Search in progress...")
        let scriptPath = scriptPath_AI
        const scriptName = 'similar_ideas.py'
        var args = [sel, openaiAPIKey, this.settings.vaultPath]
        this.status.setText('🧙 🔎: VC Wizard searching...')
        this.status.setAttr('title', 'Wizard is searching for similar ideas')
        const similar_ideas = await launch_python(pythonPath, scriptPath, scriptName, args) as string []        
        //console.log(similar_ideas)
        let search_results = await this.extract_title_and_path(similar_ideas)
        //console.log('Search results:\n')
        //console.log(search_results)
        this.updateView(search_results)
        this.status.setText('🧙: VC Wizard ready')
        this.status.setAttr('title', 'Wizard is ready')
    
    
    }

    async register_file_change(file: TAbstractFile, type:FileType){
        let scriptPath = scriptPath_AI
        const scriptName = 'index_vault.py'
        const plugin_path = scriptPath_AI
        let base_name = file.name.split('.md')[0]
        let file_path = this.settings.vaultPath + file.path
        let storage_path = plugin_path + '/modified_paths.json'
        if (type == FileType.modified){
            
            let value = {'change_type': FileType.modified, 'full_path': file_path} 
            append_to_json(storage_path, base_name, value)
        }
        else if (type == FileType.deleted){

            new Notice(`${base_name} has been deleted`)
            let value = {'change_type': FileType.deleted, 'full_path': file_path} 
            append_to_json(storage_path, base_name, value)
        }
        //todo no need to track new files since they only count when modified anyways?
        //todo could be useful only, if I make sure not to overwrite 'modified_paths' by modified if new already exists. Then use that to avoid useless search if a new file exist already in our indexed database
        //todo if I decided for yes, add an eventlistent in onload
        else if (type == FileType.new){
            new Notice(`${base_name} has been created`)
            let value = {'change_type': FileType.new, 'full_path': file_path}
            append_to_json(storage_path, base_name, value)

        }


    }
    async index_new_and_modified_files(){
        const plugin_path = scriptPath_AI
        let storage_path = plugin_path + '/modified_paths.json'
        fs.readFile(storage_path, async (err, data: any) => {
            if(err) {
            
                throw err;
            }
    
            let files_to_modify 
            new Notice("Will read changed files now..")
            this.status.setText('🧙: VC Wizard indexing...')
            this.status.setAttr('title', 'Wizard is indexing your vault...')
            try{
               files_to_modify = JSON.parse(data)
               console.log(files_to_modify)
            }
            catch (e){
                    new Notice("No new notes to index")
                    this.status.setText('🧙: VC Wizard ready')
                    this.status.setAttr('title', 'VC Wizard is ready')
                    return;
            }
            if (Object.keys(files_to_modify).length < 1){
                new Notice("No new notes to index")
                this.status.setText('🧙: VC Wizard ready')
                this.status.setAttr('title', 'VC Wizard is ready')
                return;

            }
            
            try{
                await this.index_files(storage_path)
            }
            catch (e){
                new Notice("There was an error while indexing!")
                this.status.setText('🧙: VC Wizard ready')
                this.status.setAttr('title', 'VC Wizard is ready')
                return;
            }
            //Empty the modified file
            new Notice("Finished indexing!")
            //console.log(storage_path)
            this.status.setText('🧙: VC Wizard ready')
            this.status.setAttr('title', 'VC Wizard is ready')
            save_json(storage_path, {})

        })
    
    }

    async index_vault(){
        let files = this.app.vault.getMarkdownFiles()
        let file_paths: any = {}
        let vault_path = this.settings.vaultPath
        const plugin_path = scriptPath_AI
        new Notice("Started indexing the full vault!")
        this.status.setText('🧙: VC Wizard indexing...')
        this.status.setAttr('title', 'Wizard is indexing your vault...')
        for(let file of files){
            if (file.path.includes('Readwise')){  
                file_paths[file.basename] = {'change_type': FileType.new,'full_path': vault_path + file.path}
            }
        }
        console.log(`Files length: ${file_paths.length}`)
        const json_path = plugin_path + '/' + 'file_paths.json'
        save_json(json_path, file_paths)
        try{
            await this.index_files(json_path)

        }
        catch (e){
            new Notice("There was an error while indexing!")
            return;
        }
        new Notice("Finished indexing!")
        this.status.setText('🧙: VC Wizard ready')
        this.status.setAttr('title', 'VC Wizard is ready')
        save_json(json_path, {})

        
        

    }

    async index_files(json_path: string){
        /**
         * Index all the files who paths is saved in json_path
         */
        
        let scriptPath = scriptPath_AI
        const scriptName = 'index_vault.py'
        const plugin_path = scriptPath_AI
        
        var args = [json_path, openaiAPIKey, plugin_path]


        let results = await launch_python(pythonPath, scriptPath, scriptName, args)
        console.log(results)
        this.status.setText('🧙: VC Wizard ready')
        this.status.setAttr('title', 'VC Wizard is ready')
        return results
    }
    async extract_title_and_path(results: string[]){
        
        //console.log(all_files)
        let counter = 0
        let search_results: any = {} //{'sentences': [], 'source_name': [], 'source_path': []}
        let current_filename = this.app.workspace.getActiveFile()?.basename
        console.log(`current filename: ${current_filename}`)
        for (let result of results){
          if (counter % 3 == 0 && counter!= 0)
          {
            let sentence = '\"' + results.at(counter) + '\"'
            let source = results.at(counter+2)
            source = source?.split(':')[1].trim()
            
            console.log(`counter: ${counter}, This source: ${source}`)
            
            if(source == current_filename){
                //Do not add results from the current file
                counter = counter + 1
                continue
            }
            let source_file = await this.get_path_by_name(source)
            console.log(source_file)
            if (source_file != null && source != null)
            {
                let obsidian_path = 'obsidian://advanced-uri?vault=' //open - advanced-uri
                obsidian_path = obsidian_path + this.app.vault.getName() + '&filepath=' //file - filepath
                //let source_path = source_file.path //this.app.vault.getResourcePath(source_file)
                obsidian_path = obsidian_path + source_file.path
                console.log(`my source path: ${obsidian_path}`)
                search_results[source] = {'source_path':obsidian_path, 'text': sentence} 

            }


            

          }
    
          counter = counter + 1
        }
        return search_results
    }
    async get_path_by_name(source: string|undefined){
        let all_files = this.app.vault.getMarkdownFiles()
        for (let file of all_files){
            let filename = file.basename
            if (filename == source){
                return file
            }
        }
        return null


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