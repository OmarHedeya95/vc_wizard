#from summarize import startup_summarizer
import re
import sys
import openai

"""Helper function that takes notes from a startup (through Obsidian plugin), cleans the data and returns the summary
"""
text = sys.argv[1]
key = sys.argv[2]
openai.api_key = key

def clean_startup_text(text: str):
    """Takes notes describing a startup and removes all special characters (bold, highlight, etc) as well as questions from the template that were not answered

    Args:
        text (str): notes from first call usually

    Returns:
        str: the cleaned up version of the text
    """
    result_string = ''
    lines = text.splitlines()
    for i, line in enumerate(lines,):
        if re.match('-\s*=', line):
            # Then it is a question
            next_line = lines[i + 1]
            indentation = len(next_line) - len(next_line.lstrip())
            if indentation == 0 or len(next_line) < 4:
                continue
        line = re.sub(r'(==|\*\*|#{2,})', '', line) #r'^(==|\*\*|#{2,})$'   -> r'[#==__**]'
        if len(line) > 2:
            result_string += line + '\n'
    return result_string

def startup_summarizer(query_prompt):
    """Method taking a description of a startup (usually first call) and summarizes it (in four defined sections)

    Args:
        query_prompt (str): text of notes of the first call usually

    Returns:
        str: summary
    """
    training_prompt="The following are notes in bullet point format describing a startup. The notes are divided into four sections; Team, Production, Traction, and Round Info.\n\nI am a smart and intelligent AI, that reads the notes and generate a summary for the startup, divided into four sections. In my summary, I try to answer the following questions:\n- What is the background of the founders?\n- What problem is the product solving? How does it solve it?\n- What is the current traction of the startup?\n- How much money have they raised? How much are they raising now?\nThe summary is divided into bullet points as and divided into four sections; Team, Product, Traction, and Round Info.\n--"
    request_prompt = training_prompt + '\n' + 'Notes:\n' + query_prompt + '\nSummary:\n- Team:' 
    response = openai.Completion.create(
                model="text-davinci-003",
                prompt = request_prompt,
                temperature=0.7,
                max_tokens=512,
                top_p=1,
                frequency_penalty=0,
                presence_penalty=1,
                stop=["--", "##"]
            )

    summary = str(response['choices'][0]['text'])
    return summary




text = clean_startup_text(text)

summary = startup_summarizer(text)

summary = '- Team: ' + summary

print(summary)
