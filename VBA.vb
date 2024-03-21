Sub AutoCollect()
    Dim ws As Worksheet
    Dim uniqueValues As Object
    Dim cell As Range
    Dim resultSheet As Worksheet
    Dim valueWithApostrophe As String
    Dim columnIndex As Long
    
    ' 作業シートを取得
    Set ws = ThisWorkbook.ActiveSheet
    
    ' 重複値を除外するためのオブジェクトを作成
    Set uniqueValues = CreateObject("Scripting.Dictionary")
    
    ' D列のセルを順にチェック
    For Each cell In ws.Range("D:D")
        ' 空白セルは無視
        If Len(Trim(cell.value)) > 0 Then
            ' E列の値にアポストロフィーがあるかどうかのみ考慮する
            If InStr(ws.Cells(cell.Row, 5).value, "'") > 0 Then
                valueWithApostrophe = cell.value & "|*"
            Else
                valueWithApostrophe = cell.value
            End If
            
            ' 値が辞書に存在する場合はH列の値を追加
            ' 存在しない場合は新しいキーを作成
            If uniqueValues.Exists(valueWithApostrophe) Then
                uniqueValues(valueWithApostrophe) = uniqueValues(valueWithApostrophe) & ";" & ws.Cells(cell.Row, 8).value
            Else
                uniqueValues.Add valueWithApostrophe, ws.Cells(cell.Row, 8).value
            End If
        End If
    Next cell
    
    ' 結果を出力するシートを追加または選択
    Set resultSheet = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.count))
    
    ' 結果シートにヘッダーを書き込む
    resultSheet.Range("A1").value = "ユニークな値"
    resultSheet.Range("B1").value = "個数"
    columnIndex = 3
    
    ' 結果を書き込む
    Dim i As Long
    i = 2
    For Each value In uniqueValues.Keys
        resultSheet.Range("A" & i).value = value
        resultSheet.Range("B" & i).value = Len(uniqueValues(value)) - Len(Replace(uniqueValues(value), ";", "")) + 1
        
        ' C列の値を横向きに列挙
        Dim j As Long
        j = 1
        For Each Item In Split(uniqueValues(value), ";")
            resultSheet.Cells(i, columnIndex) = Item
            columnIndex = columnIndex + 1
            j = j + 1
        Next Item
        
        i = i + 1
        columnIndex = 3
    Next value
End Sub

