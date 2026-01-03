import express from 'express';
const router = express.Router();
import { OpenAI } from 'openai';
import { exec } from 'child_process';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not defined in environment variables');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
router.post('/chat', async (req, res) => {
  // const { messages } = req.body;
  try {
    exec('swift dump_ui.swift', { maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        return;
      }
      if (stderr) {
        console.error(`Stderr: ${stderr}`);
        return;
      }
      if (stdout.length > 3000) {
        stdout = stdout.slice(0, 3000);
      }
      const messages = [
        {
          role: 'system' as const,
          content: `You are an assistant that helps users by interpreting the UI structure of their macOS applications. You receive a description of the UI elements and their hierarchy, and you provide a list of actions to perform on their behalf based on the user's request. Currently these actions are only clicks to specific elements. 
          You should only return an array of objects e.g. [{application: 'Chrome', action: 'New Tab'}, {application: 'Chrome', action: 'Search'}]. The structure is this ${stdout}`,
        },
        req.body.messages[0],
      ];

      console.log(`Output: ${stdout}`);
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini-audio-preview',
        messages: messages,
      });
      let actionsString = response.choices[0].message.content as string;
      actionsString = actionsString
        .replace(/\n/g, '')
        .replace('```json', '')
        .replace('```', '')
        .replace(/\\/g, '');
      console.log(`Output: ${actionsString}`);

      try {
        const actions = JSON.parse(actionsString) as { application: string; action: string }[];
        for (const action of actions) {
          const command = `swift click_element_dynamic.swift "${action.action}" "${action.application}"`;
          exec(command, (error, stdout, stderr) => {
            if (error) {
              console.error(`Error executing action: ${error.message}`);
              return;
            }
            if (stderr) {
              console.error(`Stderr from action: ${stderr}`);
              return;
            }
            console.log(`Action executed: ${stdout}`);
          });
          // add delay between actions
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        return res.json('ok');
      } catch (e) {
        console.error('Failed to parse actions or execute them:', e);
        return res.json('something went wrong');
      }
    });
  } catch (error) {
    console.error('Error communicating with OpenAI:', error);
    res.status(500).json({ error: 'Error communicating with OpenAI' });
  }
});

export default router;
