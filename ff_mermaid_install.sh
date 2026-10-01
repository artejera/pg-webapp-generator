cd /home/artejera/Documents/trae_projects/HotY 
sudo npm i -g @mermaid-js/mermaid-cli
#awk '/^```mermaid$/{flag=1;next}/^```$/{flag=0}flag' flowchart.md > /tmp/flowchart.mmd
#mmdc -i /tmp/flowchart.mmd -o /tmp/flowchart.png -b white -w 2400
#mmdc -i /tmp/flowchart.mmd -o /tmp/flowchart.svg -b white
