package com.jobssearch.resumes;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ResumeExportService {
    private static final float PAGE_MARGIN = 54;
    private static final float FONT_SIZE = 10;
    private static final float LINE_HEIGHT = 14;
    private static final float USABLE_WIDTH = PDRectangle.LETTER.getWidth() - PAGE_MARGIN * 2;
    private static final String PDF_FONT_RESOURCE =
            "/org/apache/pdfbox/resources/ttf/LiberationSans-Regular.ttf";

    public ExportedDocument export(String text, String format) {
        return switch (format.toLowerCase(Locale.ROOT)) {
            case "pdf" -> new ExportedDocument("application/pdf", "tailored-resume.pdf", toPdf(text));
            case "docx" -> new ExportedDocument(
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "tailored-resume.docx",
                    toDocx(text));
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Choose a supported export format: pdf or docx");
        };
    }

    private byte[] toDocx(String text) {
        try (XWPFDocument document = new XWPFDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            for (String line : text.split("\\R", -1)) {
                XWPFParagraph paragraph = document.createParagraph();
                paragraph.setAlignment(ParagraphAlignment.LEFT);
                paragraph.setSpacingAfter(100);
                XWPFRunStyle.apply(paragraph, line);
            }
            document.write(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not create the Word document");
        }
    }

    private byte[] toPdf(String text) {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                InputStream fontStream = ResumeExportService.class.getResourceAsStream(PDF_FONT_RESOURCE)) {
            if (fontStream == null) {
                throw new ResponseStatusException(
                        HttpStatus.INTERNAL_SERVER_ERROR, "The PDF font resource is unavailable");
            }
            PDType0Font font = PDType0Font.load(document, fontStream);
            List<String> lines = wrapLines(text, font);
            int linesPerPage = (int) ((PDRectangle.LETTER.getHeight() - PAGE_MARGIN * 2) / LINE_HEIGHT);
            for (int start = 0; start < lines.size(); start += linesPerPage) {
                drawPage(document, font, lines.subList(start, Math.min(start + linesPerPage, lines.size())));
            }
            document.save(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not create the PDF from this resume text");
        }
    }

    private List<String> wrapLines(String text, PDType0Font font) throws IOException {
        List<String> result = new ArrayList<>();
        for (String paragraph : text.split("\\R", -1)) {
            if (paragraph.isBlank()) {
                result.add("");
                continue;
            }
            StringBuilder line = new StringBuilder();
            for (String word : paragraph.trim().split("\\s+")) {
                String candidate = line.isEmpty() ? word : line + " " + word;
                if (!line.isEmpty() && font.getStringWidth(candidate) * FONT_SIZE / 1000 > USABLE_WIDTH) {
                    result.add(line.toString());
                    line.setLength(0);
                }
                if (line.isEmpty() && font.getStringWidth(word) * FONT_SIZE / 1000 > USABLE_WIDTH) {
                    result.add(word);
                } else {
                    if (!line.isEmpty()) {
                        line.append(' ');
                    }
                    line.append(word);
                }
            }
            if (!line.isEmpty()) {
                result.add(line.toString());
            }
        }
        return result.isEmpty() ? List.of("") : result;
    }

    private void drawPage(PDDocument document, PDType0Font font, List<String> lines) throws IOException {
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
            stream.beginText();
            stream.setFont(font, FONT_SIZE);
            stream.setLeading(LINE_HEIGHT);
            stream.newLineAtOffset(PAGE_MARGIN, PDRectangle.LETTER.getHeight() - PAGE_MARGIN);
            for (String line : lines) {
                if (!line.isEmpty()) {
                    stream.showText(line);
                }
                stream.newLine();
            }
            stream.endText();
        }
    }

    public record ExportedDocument(String contentType, String fileName, byte[] content) {
    }

    private static final class XWPFRunStyle {
        private XWPFRunStyle() {
        }

        static void apply(XWPFParagraph paragraph, String text) {
            var run = paragraph.createRun();
            run.setFontFamily("Arial");
            run.setFontSize(10);
            run.setText(text);
        }
    }
}
