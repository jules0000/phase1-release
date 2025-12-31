import json
import os
from pathlib import Path

from app import create_app, db
from app.models.content import Topic, Module, Lesson, NeuralContent

TITLE_MAP = {
    '1': 'AI 101',
    '2': 'Text Generation AI',
    '3': 'Media-based AI',
    '4': 'AI Applications in the Real World',
    '5': 'Prompt Engineering',
}


def seed_from_folder(folder: str):
    base = Path(folder)
    files = sorted(list(base.glob('*.json')))
    created_topics = 0
    created_modules = 0
    created_lessons = 0

    for f in files:
        # Handle possible UTF-8 BOM
        with open(f, 'r', encoding='utf-8-sig') as fp:
            data = json.load(fp)

        stem = Path(f).stem
        topic_title = data.get('title') or data.get('topic') or TITLE_MAP.get(stem, stem)
        try:
            topic_number = int(Path(f).stem)
        except Exception:
            topic_number = None
        topic = Topic.query.filter((Topic.title == topic_title) | (Topic.topic_number == (int(stem) if stem.isdigit() else -1))).first()
        if not topic:
            # Provide required fields like topic_number
            topic = Topic(topic_number=topic_number or (int(stem) if stem.isdigit() else 0), title=topic_title, description=data.get('description', ''))
            db.session.add(topic)
            db.session.flush()
            created_topics += 1
        else:
            # Update title if placeholder numeric
            if topic.title == stem and stem in TITLE_MAP:
                topic.title = TITLE_MAP[stem]

        modules_list = []
        if isinstance(data, dict):
            modules_list = (
                data.get('modules')
                or (data.get('ai_course') or {}).get('modules')
                or []
            )
        for m in modules_list:
            module_title = m.get('title') or m.get('moduleTitle')
            module = Module.query.filter_by(title=module_title, topic_id=topic.id).first()
            if not module:
                module_number = m.get('number') or m.get('moduleNumber') or (created_modules + 1)
                module = Module(title=module_title, topic_id=topic.id, description=m.get('summary', ''), module_number=module_number)
                db.session.add(module)
                db.session.flush()
                created_modules += 1

            for l in m.get('lessons', []):
                lesson_title = l.get('lessonTitle') or l.get('title')
                lesson = Lesson.query.filter_by(title=lesson_title, module_id=module.id).first()
                if not lesson:
                    lesson_number = l.get('number') or l.get('lessonNumber') or 1
                    inferred = (lesson_title or '').split(':', 1)[0].strip().lower()
                    lesson_type = (l.get('type') or l.get('lessonType') or inferred or 'learn').replace(' ', '_')
                    content_data = l
                    lesson = Lesson(title=lesson_title, module_id=module.id, description=l.get('summary', ''), lesson_number=int(lesson_number), lesson_type=lesson_type, content_data=content_data)
                    db.session.add(lesson)
                    created_lessons += 1

    db.session.commit()
    return created_topics, created_modules, created_lessons


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        folder = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'data', 'neural-content')
        folder = os.path.abspath(folder)
        t, m, l = seed_from_folder(folder)
        print(f"Seeded topics={t}, modules={m}, lessons={l} from {folder}")


