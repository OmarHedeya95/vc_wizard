from jina import DocumentArray
import re
import openai
import numpy as np
from jina import Document
import json
import os

def load_dataset(path='./test_db/', metric='cosine', n_dim=4096, max_connection=16, ef_search=50):
    # Load or Create Annlite Index Database
    data_path = path
    da = DocumentArray(storage='annlite', config={
        'data_path': data_path, 'n_dim': n_dim, 'metric': metric, 'max_connection': max_connection, 'ef_search': ef_search}) #connection: 48, ef_search: 100
    #da.summary()

    return da

def get_doc_name_for_readwise(full_text: str):
    author_name = re.findall(r"- Author: \[\[(.*)\]\]", full_text)[0]
    title = re.findall(r"- Full Title: (.*)", full_text)[0]
    category = re.findall(r"- Category: #(.*)", full_text)[0]

    if 'book' in category:
        highlight = 'the book ' + '\'' + title + '\'' + ' by ' + author_name
    elif 'article' in category:
        highlight = 'the article ' + '\'' + title + '\''
    else:
        highlight = 'a thread by ' + author_name
    
    return highlight

def extract_note_title(full_path):
    sections = full_path.split('/')
    filename = sections[-1]
    #to remove extension
    title = filename.split('.')[0]
    return title

def remove_links_2(note: str):
    #remove ([....))
    pattern = r'\(\[.*\)\)'
    #print(note)
    note = re.sub(pattern, '', note)
    #print(note)

    #remove urls
    pattern = r'https?://\S+'
    note = re.sub(pattern, '', note)

    #remove locations from books
    note = note.replace(u'\xa0', '')
    pattern = r'\(Location\d+\)'
    note = re.sub(pattern, '', note)

    note = note.replace('![](', '')
    note = note.replace('\n', '')
    note = note.replace('[[orange]]', '')

    note = remove_double_space(note)
    #print(note)
    return note

def get_start_and_end_of_text(text):
    try:
        body_start = re.search(r"#\s+(.*)\n", text).end()
    except:
        body_start = 0
    
    # In case ##References does not exist, take till the end of file
    try:
        body_end = re.search(r"#\s+Stop Indexing|##\s+References", text).start()
    except:
        body_end = None
    
    return body_start, body_end

def remove_special_chars(s):
    # Use a regular expression to match any of the specified characters
    pattern = r"[*_>=]+"
    # Replace the characters with an empty string
    result = re.sub(pattern, "", s)
    return result

def remove_double_space(s):
    pattern = r"  +"
    result = re.sub(pattern, " ", s)
    return result

def split_note_into_sentences(note):
    sentences = []
    for line in note.split('\n'):
        line = line.strip()
        sub_sentences = line.split('. ')
        for sub_sentence in sub_sentences:
            if sub_sentence != '':
                #sentence should have a space, otherwise it is just a word
                if " " in sub_sentence:
                    sentences.append(sub_sentence.strip())
    return sentences


def extract_text(s):
    # Use a regular expression to match the text between '![[ and ']]'
    # This is to remove the embedded media in notes
    pattern = r"!\[\[(.+?)\]\]"
    result = re.sub(pattern, "", s)
    result = remove_special_chars(result)
    result = remove_double_space(result)
    return result

def encode_query(openai_key: str, query: str, n_dim:int):
    """You get text and deliver back a Jina document with embedding using coherence large model

    Args:
        query (str): _description_

    Returns:
        Document: Jina AI document with embeddings
    """
    if n_dim == 1536:
        openai.api_key = openai_key
        embeds = openai.Embedding.create(input=query, model = "text-embedding-ada-002")['data'][0]['embedding']
    else:
        raise ValueError("Unknown embedding dimension sent")
        
    embeds = np.array(embeds)
    embedded_query = Document(text=query)
    embedded_query.embedding = embeds.reshape(n_dim, )

    return embedded_query

def remove_special_characters(text):
    """
    Remove all special characters from a string and leave only alphabets and numbers.

    Parameters:
    - text: the string to process

    Returns:
    - The input string with all special characters removed.
    """
    # Use a regular expression to remove all non-alphabetic and non-numeric characters
    return re.sub(r'[^A-Za-z0-9\s]', '', text)

def get_tokens(doc: Document):
    """Return all words in a document in lower case

    Args:
        doc (Document): _description_

    Returns:
        _type_: _description_
    """
    #get name first
    note = remove_special_characters(doc.text.lower()).split()
    note_body = []
    for chunk in doc.chunks:
        note_body.extend(remove_special_characters(chunk.text.lower()).split())
    
    note.extend(note_body)
    return note

def is_file_empty(filename):
  # Check if the file exists
  if not os.path.exists(filename):
    raise FileNotFoundError(f"File '{filename}' does not exist.")

  # Check if the file is empty
  return os.stat(filename).st_size == 0


def save_json(filename: str, my_dict: dict):
    with open(filename, "w") as f:
        json.dump(my_dict, f)

def load_json(filename: str):
    my_dict = {}
    # Load a dictionary from a JSON file
    if not is_file_empty(filename):
        with open(filename, "r") as f:
            my_dict = json.load(f)
    return my_dict


def load_bm25_index (filepath:str):
    bm25_index = load_json(filepath)
    return bm25_index


def add_highlight(path: str):
    '''It only add notes that do not have type #Conecpt or #MOC, and have a status of ✅ or 🌲
        Tags are small case and have underscores between words
    '''
    #todo This needs to be improved! Include tags and make it faster!
    if '🔖 Readwise' in path:
        with open(path) as f:
            full_text = f.read()
            
            highlight_readwise = get_doc_name_for_readwise(full_text)
            highlight = extract_note_title(path)
            
            note_index_start = full_text.find('## Highlights') + len('## Highlights')
            notes_text = full_text[note_index_start: ]
            notes_list = notes_text.split('\n\n\n')#split('- ')
            notes_list_processed = []
            for i, note in enumerate(notes_list,0):
                note = remove_links_2(note)
                if note != '':
                    notes_list_processed.append(note)        
        return notes_list_processed, highlight , highlight_readwise

    '''with open(path) as f:
        lines = f.readlines()

        highlight = ''
        tags = []
        note = ''
        for line in lines:
            if re.match('^# (.+)', line):
                highlight = re.findall('# (.+)', line)
                #print(highlight)
                highlight = highlight[0]
            
            elif re.match('Tags:', line):
                # After the [[ match everything that is not ] 
                tags = re.findall('\[\[([^\]]*)',line)
                #print(tags)
            elif (re.match('Type: #Concept', line) or re.match('Status: #MOC', line)):
                return None, None'''
            

    with open(path) as f:
        text = f.read()
        body_start, body_end = get_start_and_end_of_text(text)


        #The title should be simply the name of the file not the headline
        full_path = f.name 
        title = extract_note_title(full_path)
        body = text[body_start:body_end]
        #Removes special characters (bold, etc) and embedded media from text
        body = extract_text(body)
        note = body
        highlight = title


    notes_list = split_note_into_sentences(note)
    return notes_list, highlight, None