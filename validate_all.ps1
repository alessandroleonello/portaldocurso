$lines = Get-Content 'index.html'

$stack = New-Object System.Collections.ArrayList

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    $lineNum = $i + 1

    # Match opening divs
    $matchesOpen = [regex]::Matches($line, '<div(\s+[^>]*)?>')
    foreach ($m in $matchesOpen) {
        # Extract id or class if any
        $tag = $m.Value
        $id = if ($line -match 'id="([^"]+)"') { $matches[1] } else { "" }
        $cls = if ($line -match 'class="([^"]+)"') { $matches[1] } else { "" }
        $desc = "L$($lineNum) div (id='$id', class='$cls')"
        [void]$stack.Add($desc)
    }

    # Match closing divs
    $matchesClose = [regex]::Matches($line, '</div>')
    foreach ($m in $matchesClose) {
        if ($stack.Count -gt 0) {
            $stack.RemoveAt($stack.Count - 1)
        } else {
            Write-Host "Extra closing </div> at Line $lineNum!"
        }
    }
}

Write-Host "Finished checking. Unclosed divs remaining in stack: $($stack.Count)"
foreach ($item in $stack) {
    Write-Host "Unclosed: $item"
}
