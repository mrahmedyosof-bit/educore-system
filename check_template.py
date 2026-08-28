import re

with open(r'C:/Users/mr ahmed/Desktop/educore-system/app/components/ExpensesTab.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Check for template literals
pattern = r'`[^`]*`'
matches = re.findall(pattern, content, re.DOTALL)
print(f'Template literals found: {len(matches)}')

# Check backticks
backtick_positions = [m.start() for m in re.finditer(r'`', content)]
print(f'Total backticks: {len(backtick_positions)}')
if len(backtick_positions) % 2 != 0:
    print('WARNING: Odd number of backticks!')
else:
    print('Backticks are balanced')

# Check for any unclosed template literals by looking at each line
lines = content.split('\n')
for i, line in enumerate(lines, 1):
    backticks_in_line = line.count('`')
    if backticks_in_line % 2 != 0:
        print(f'Line {i}: Odd backticks ({backticks_in_line}): {line[:100]}')